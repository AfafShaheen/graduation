from datetime import UTC, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.schemas.user import UserVerifyStep1, UserCompleteStep2
from app.services.email_service import generate_otp, hash_otp, send_otp_email, OtpPurpose
from app.models.otp_code import OtpCodeModel
import bcrypt

async def verify_graduate_step1(db: AsyncSession, data: UserVerifyStep1) -> dict:
    # 1. Find college and its event
    college_result = await db.execute(
        select(CollegeModel).where(CollegeModel.id == data.college_id)
    )
    college = college_result.scalar_one_or_none()
    if not college:
        raise ValueError("الكلية المحددة غير موجودة")

    event_result = await db.execute(
        select(EventModel).where(EventModel.id == college.event_id)
    )
    event = event_result.scalar_one_or_none()
    if not event:
        raise ValueError("الحفل المرتبط بالكلية غير موجود")

    # 2. Check event registration end time rule:
    # If registration ended -> you can't make an account because it ended.
    # If registration didn't start yet -> he can register.
    now = datetime.now(UTC)
    reg_end = event.registration_end
    if reg_end.tzinfo is None:
        reg_end = reg_end.replace(tzinfo=UTC)

    if now > reg_end:
        raise ValueError("لا يمكنك إنشاء حساب لأن فترة التسجيل قد انتهت.")

    # 3. Compare with university records (FR-2)
    uni_record_result = await db.execute(
        select(UniversityRecordModel).where(
            UniversityRecordModel.university_id == data.university_id,
            UniversityRecordModel.college_id == data.college_id
        )
    )
    uni_record = uni_record_result.scalar_one_or_none()

    if not uni_record:
        raise ValueError("ما قدرنا نتحقق من بياناتك، يرجى مراجعتها أو التواصل مع الاتحاد")

    if (
        uni_record.full_name.strip() != data.full_name.strip() or
        uni_record.father_name.strip() != data.father_name.strip() or
        uni_record.mother_name.strip() != data.mother_name.strip() or
        uni_record.gender.strip() != data.gender.strip()
    ):
        raise ValueError("ما قدرنا نتحقق من بياناتك، يرجى مراجعتها أو التواصل مع الاتحاد")

    return {
        "success": True,
        "message": "تم التحقق من البيانات بنجاح، يمكنك الانتقال للخطوة التالية",
        "university_id": data.university_id,
        "college_id": data.college_id
    }


async def complete_graduate_registration_step2(db: AsyncSession, data: UserCompleteStep2) -> dict:
    # 1. Verify university record exists again
    uni_record_result = await db.execute(
        select(UniversityRecordModel).where(
            UniversityRecordModel.university_id == data.university_id,
            UniversityRecordModel.college_id == data.college_id
        )
    )
    uni_record = uni_record_result.scalar_one_or_none()
    if not uni_record:
        raise ValueError("السجل الجامعي غير موجود أو غير مطابقة")

    # 2. Check if graduate already registered
    existing_grad = await db.execute(
        select(GraduateModel).where(
            (GraduateModel.email == data.email) | (GraduateModel.university_id == data.university_id)
        )
    )
    if existing_grad.scalar_one_or_none():
        raise ValueError("الرقم الجامعي أو البريد الإلكتروني مسجل مسبقاً")

    # 3. Hash password (bcrypt)
    password_hash = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # 4. Create graduate record
    new_graduate = GraduateModel(
        full_name=uni_record.full_name,
        gender=uni_record.gender,
        college_id=uni_record.college_id,
        email=data.email,
        phone=data.phone,
        email_verified=False,
        father_name=uni_record.father_name,
        mother_name=uni_record.mother_name,
        password_hash=password_hash,
        university_id=uni_record.university_id
    )
    db.add(new_graduate)
    await db.flush()
    await db.refresh(new_graduate)

    # 5. Generate and send OTP (FR-4)
    now = datetime.now(UTC)
    otp_code = generate_otp()
    otp_hash = hash_otp(otp_code)
    expires_at = now.replace(minute=now.minute + 10)

    otp_entry = OtpCodeModel(
        graduate_id=new_graduate.id,
        purpose=OtpPurpose.EMAIL_VERIFICATION.value,
        code_hash=otp_hash,
        expires_at=expires_at,
        failed_attempts=0
    )
    db.add(otp_entry)
    await db.commit()

    send_otp_email(data.email, otp_code, OtpPurpose.EMAIL_VERIFICATION)

    return {
        "message": "تم إنشاء الحساب بنجاح، يرجى التحقق من بريدك الإلكتروني لإدخال رمز التفعيل (OTP)",
        "graduate_id": new_graduate.id
    }
