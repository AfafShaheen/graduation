from datetime import UTC, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.schemas.graduate import UserVerifyStep1, RegisterStep2Request
from app.services.email_service import OtpPurpose
from app.services.auth_service import issue_and_send_otp
from app.core import messages
from app.core.redis import redis_client
from app.core.security import secret_key, create_verification_token
import bcrypt
import re
from jose import jwt, JWTError

ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 15
_VERIFICATION_FIELD = "verification" + "_token"


def normalize_arabic(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'[\u0617-\u061A\u064B-\u0652]', '', text)
    text = re.sub(r'[أإآ]', 'ا', text)
    text = text.replace('ة', 'ه')
    text = text.replace('ى', 'ي')
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def create_registration_token(data: dict) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    to_encode = data.copy()
    to_encode.update({"exp": expire, "purpose": "registration"})
    return jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)


def decode_registration_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        if payload.get("purpose") != "registration":
            raise JWTError("invalid token purpose")
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Registration session expired. Please redo Step 1 (انتهت جلسة التسجيل. يرجى إعادة الخطوة الأولى.)"
        )


async def check_step1_rate_limit(university_id: str) -> None:
    key = f"rate_limit:step1:{university_id}"
    try:
        attempts = await redis_client.get(key)
        if attempts and int(attempts) >= 10:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many verification attempts. Please try again later."
            )
        await redis_client.incr(key)
        await redis_client.expire(key, 300)
    except HTTPException:
        raise
    except Exception:
        pass


async def verify_step1_service(db: AsyncSession, data: UserVerifyStep1) -> dict:
    await check_step1_rate_limit(data.university_id)

    existing_grad = await db.execute(
        select(GraduateModel).where(GraduateModel.university_id == data.university_id)
    )
    if existing_grad.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="University ID already registered (الرقم الجامعي مسجل مسبقاً)."
        )

    uni_record_result = await db.execute(
        select(UniversityRecordModel).where(
            UniversityRecordModel.university_id == data.university_id,
            UniversityRecordModel.college_id == data.college_id
        )
    )
    uni_record = uni_record_result.scalar_one_or_none()

    if not uni_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student record not found in university records (سجل الطالب غير موجود في السجلات الجامعية)."
        )

    if (
        normalize_arabic(uni_record.full_name) != normalize_arabic(data.full_name) or
        normalize_arabic(uni_record.father_name) != normalize_arabic(data.father_name) or
        normalize_arabic(uni_record.mother_name) != normalize_arabic(data.mother_name) or
        uni_record.gender.strip() != data.gender.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student record not found in university records (سجل الطالب غير موجود في السجلات الجامعية أو البيانات غير مطابقة)."
        )

    token_payload = {
        "university_id": data.university_id,
        "college_id": data.college_id,
        "full_name": uni_record.full_name,
        "gender": uni_record.gender,
        "father_name": uni_record.father_name,
        "mother_name": uni_record.mother_name,
    }
    registration_token = create_registration_token(token_payload)

    return {
        "valid": True,
        "registration_token": registration_token
    }


async def register_step2_service(db: AsyncSession, data: RegisterStep2Request) -> dict:
    payload = decode_registration_token(data.registration_token)
    university_id = payload.get("university_id")
    college_id = payload.get("college_id")
    full_name = payload.get("full_name")
    gender = payload.get("gender")
    father_name = payload.get("father_name")
    mother_name = payload.get("mother_name")

    if not university_id or not college_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Registration session expired. Please redo Step 1 (انتهت جلسة التسجيل. يرجى إعادة الخطوة الأولى.)"
        )

    email_check = await db.execute(
        select(GraduateModel).where(GraduateModel.email == data.email)
    )
    if email_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="البريد الإلكتروني مسجل مسبقاً."
        )

    password_hash = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    new_graduate = GraduateModel(
        full_name=full_name,
        gender=gender,
        college_id=college_id,
        email=data.email,
        phone=data.phone,
        email_verified=False,
        father_name=father_name,
        mother_name=mother_name,
        password_hash=password_hash,
        university_id=university_id
    )
    db.add(new_graduate)
    await db.flush()
    await db.refresh(new_graduate)

    sent = await issue_and_send_otp(db, new_graduate, OtpPurpose.EMAIL_VERIFICATION, new_graduate.email)

    message = (
        "تم إنشاء الحساب بنجاح. يرجى إدخال رمز التحقق (OTP) المرسل إلى بريدك الإلكتروني لتفعيله."
        if sent
        else messages.REGISTER_PARTIAL
    )

    return {
        "status": "success",
        "message": message,
        "graduate_id": new_graduate.id,
        "otp_sent": sent,
        _VERIFICATION_FIELD: create_verification_token(new_graduate.id),
    }


async def fetch_graduate(db: AsyncSession, graduate_id: int) -> GraduateModel | None:
    stmt = select(GraduateModel).where(GraduateModel.id == graduate_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
