from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.graduate import GraduateModel
from app.models.otp_code import OtpCodeModel
from app.services.email_service import (
    OtpPurpose,
    generate_otp,
    hash_otp,
    send_otp_email,
    OTP_TTL_MINUTES,
)
from app.schemas.auth import VerifyOtpRequest, ResendOtpRequest, ChangeEmailRequest
from datetime import UTC, datetime

router = APIRouter(prefix="/api/auth", tags=["Auth & OTP"])

@router.post("/verify-otp")
async def verify_otp_endpoint(data: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(OtpCodeModel)
        .where(
            OtpCodeModel.graduate_id == data.graduate_id,
            OtpCodeModel.purpose == data.purpose.value,
        )
        .order_by(OtpCodeModel.id.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    otp_row = result.scalar_one_or_none()

    if otp_row is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رمز التحقق غير موجود.")

    now = datetime.now(UTC)

    if otp_row.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رمز التحقق مستخدم مسبقاً.")

    expires_at = otp_row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if now > expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="انتهت صلاحية رمز التحقق.")

    if otp_row.failed_attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="لقد تجاوزت الحد الأقصى لمحاولات الإدخال الفاشلة (5). يرجى طلب رمز جديد."
        )

    submitted_hash = hash_otp(data.code)
    if submitted_hash == otp_row.code_hash:
        otp_row.used_at = now
        if data.purpose == OtpPurpose.EMAIL_VERIFICATION:
            grad_stmt = select(GraduateModel).where(GraduateModel.id == data.graduate_id)
            grad_res = await db.execute(grad_stmt)
            grad = grad_res.scalar_one_or_none()
            if grad:
                grad.email_verified = True

        await db.commit()
        return {"status": "success", "message": "تم التحقق بنجاح."}
    else:
        otp_row.failed_attempts += 1
        await db.commit()

        if otp_row.failed_attempts >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="لقد تجاوزت الحد الأقصى لمحاولات الإدخال الفاشلة (5). يرجى طلب رمز جديد."
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"رمز التحقق غير صحيح. المحاولات المتبقية: {5 - otp_row.failed_attempts}"
        )


@router.post("/resend-otp")
async def resend_otp_endpoint(data: ResendOtpRequest, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(OtpCodeModel)
        .where(
            OtpCodeModel.graduate_id == data.graduate_id,
            OtpCodeModel.purpose == data.purpose.value,
        )
        .order_by(OtpCodeModel.id.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    last_otp = result.scalar_one_or_none()

    now = datetime.now(UTC)
    if last_otp:
        created_at = last_otp.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        elapsed_seconds = (now - created_at).total_seconds()
        if elapsed_seconds < 60:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="يرجى الانتظار لمدة دقيقة واحدة قبل طلب رمز جديد."
            )

    grad_stmt = select(GraduateModel).where(GraduateModel.id == data.graduate_id)
    grad_res = await db.execute(grad_stmt)
    grad = grad_res.scalar_one_or_none()
    if not grad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على حساب الخريج.")

    new_code = generate_otp()
    new_hash = hash_otp(new_code)
    expires_at = now.replace(minute=now.minute + OTP_TTL_MINUTES)

    new_otp_entry = OtpCodeModel(
        graduate_id=data.graduate_id,
        purpose=data.purpose.value,
        code_hash=new_hash,
        expires_at=expires_at,
        failed_attempts=0
    )
    db.add(new_otp_entry)
    await db.commit()

    send_otp_email(grad.email, new_code, data.purpose)

    return {"status": "success", "message": "تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني."}


@router.post("/change-email")
async def change_email_endpoint(data: ChangeEmailRequest, db: AsyncSession = Depends(get_db)):
    grad_stmt = select(GraduateModel).where(GraduateModel.id == data.graduate_id)
    grad_res = await db.execute(grad_stmt)
    grad = grad_res.scalar_one_or_none()
    if not grad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على حساب الخريج.")

    if grad.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن تغيير البريد الإلكتروني بعد تفعيله."
        )

    email_check_stmt = select(GraduateModel).where(GraduateModel.email == data.new_email, GraduateModel.id != data.graduate_id)
    email_check_res = await db.execute(email_check_stmt)
    if email_check_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="البريد الإلكتروني الجديد مستخدم بالفعل من قبل حساب آخر."
        )

    grad.email = data.new_email
    db.add(grad)

    now = datetime.now(UTC)
    new_code = generate_otp()
    new_hash = hash_otp(new_code)
    expires_at = now.replace(minute=now.minute + OTP_TTL_MINUTES)

    new_otp_entry = OtpCodeModel(
        graduate_id=data.graduate_id,
        purpose=OtpPurpose.EMAIL_VERIFICATION.value,
        code_hash=new_hash,
        expires_at=expires_at,
        failed_attempts=0
    )
    db.add(new_otp_entry)
    await db.commit()

    send_otp_email(data.new_email, new_code, OtpPurpose.EMAIL_VERIFICATION)

    return {
        "status": "success",
        "message": "تم تحديث البريد الإلكتروني بنجاح، وإرسال رمز تحقق جديد إلى بريدك الجديد."
    }
