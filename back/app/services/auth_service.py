from datetime import UTC, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.models.otp_code import OtpCodeModel
from app.services.email_service import (
    OtpPurpose,
    generate_otp,
    hash_otp,
    send_otp_email,
    OTP_TTL_MINUTES,
)
from app.core.redis import redis_client
import bcrypt


async def check_redis_cooldown(identifier: str, action: str) -> None:
    """Check Redis-backed 60-second cooldown rate limit for maximum performance."""
    key = f"cooldown:{action}:{identifier}"
    try:
        ttl = await redis_client.ttl(key)
        if ttl > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="يرجى الانتظار لمدة دقيقة واحدة قبل طلب رمز جديد."
            )
    except HTTPException:
        raise
    except Exception:
        pass


async def set_redis_cooldown(identifier: str, action: str, seconds: int = 60) -> None:
    key = f"cooldown:{action}:{identifier}"
    try:
        await redis_client.setex(key, seconds, "1")
    except Exception:
        pass


async def check_redis_failed_attempts(identifier: str) -> int:
    key = f"attempts:otp:{identifier}"
    try:
        val = await redis_client.get(key)
        return int(val) if val else 0
    except Exception:
        return 0


async def increment_redis_failed_attempts(identifier: str) -> int:
    key = f"attempts:otp:{identifier}"
    try:
        val = await redis_client.incr(key)
        await redis_client.expire(key, 600)  # 10 mins TTL
        return val
    except Exception:
        return 1


async def reset_redis_failed_attempts(identifier: str) -> None:
    key = f"attempts:otp:{identifier}"
    try:
        await redis_client.delete(key)
    except Exception:
        pass


async def fetch_latest_otp(db: AsyncSession, graduate_id: int, purpose: OtpPurpose) -> OtpCodeModel | None:
    stmt = (
        select(OtpCodeModel)
        .where(
            OtpCodeModel.graduate_id == graduate_id,
            OtpCodeModel.purpose == purpose.value,
        )
        .order_by(OtpCodeModel.id.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def fetch_graduate(db: AsyncSession, graduate_id: int) -> GraduateModel | None:
    stmt = select(GraduateModel).where(GraduateModel.id == graduate_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def fetch_graduate_by_email(db: AsyncSession, email: str) -> GraduateModel | None:
    stmt = select(GraduateModel).where(GraduateModel.email == email)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def validate_otp_expiration(expires_at) -> bool:
    now = datetime.now(UTC)
    exp = expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    return now <= exp


def check_failed_attempts(failed_attempts: int) -> bool:
    return failed_attempts >= 5


async def increment_otp_failed_attempts(db: AsyncSession, otp_row: OtpCodeModel) -> int:
    otp_row.failed_attempts += 1
    await db.commit()
    await increment_redis_failed_attempts(str(otp_row.graduate_id))
    return otp_row.failed_attempts


async def mark_otp_as_used(db: AsyncSession, otp_row: OtpCodeModel) -> None:
    otp_row.used_at = datetime.now(UTC)
    await db.commit()
    await reset_redis_failed_attempts(str(otp_row.graduate_id))


async def mark_email_verified(db: AsyncSession, graduate_id: int) -> None:
    grad = await fetch_graduate(db, graduate_id)
    if grad:
        grad.email_verified = True
        await db.commit()


async def create_and_save_new_otp(db: AsyncSession, graduate_id: int, purpose: OtpPurpose) -> tuple[str, str]:
    now = datetime.now(UTC)
    code = generate_otp()
    code_hash = hash_otp(code)
    expires_at = now.replace(minute=now.minute + OTP_TTL_MINUTES)

    new_entry = OtpCodeModel(
        graduate_id=graduate_id,
        purpose=purpose.value,
        code_hash=code_hash,
        expires_at=expires_at,
        failed_attempts=0
    )
    db.add(new_entry)
    await db.commit()

    # Set Redis cooldown and reset attempts counter
    await set_redis_cooldown(str(graduate_id), purpose.value, 60)
    await reset_redis_failed_attempts(str(graduate_id))

    return code, purpose.value


async def dispatch_otp_email(email: str, code: str, purpose: OtpPurpose) -> bool:
    return send_otp_email(email, code, purpose)


async def check_email_uniqueness(db: AsyncSession, new_email: str, graduate_id: int) -> None:
    stmt = select(GraduateModel).where(GraduateModel.email == new_email, GraduateModel.id != graduate_id)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="البريد الإلكتروني الجديد مستخدم بالفعل من قبل حساب آخر."
        )


async def update_graduate_email_address(db: AsyncSession, graduate_id: int, new_email: str) -> GraduateModel:
    grad = await fetch_graduate(db, graduate_id)
    if not grad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على حساب الخريج.")
    if grad.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن تغيير البريد الإلكتروني بعد تفعيله."
        )
    await check_email_uniqueness(db, new_email, graduate_id)
    grad.email = new_email
    db.add(grad)
    await db.commit()
    return grad


async def update_graduate_password(db: AsyncSession, grad: GraduateModel, new_password: str) -> None:
    password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    grad.password_hash = password_hash
    db.add(grad)
    await db.commit()


# High-level service orchestrators calling granular task functions
async def verify_otp_service(db: AsyncSession, graduate_id: int, code: str, purpose: OtpPurpose) -> dict:
    # Check failed attempts in Redis first for speed
    redis_attempts = await check_redis_failed_attempts(str(graduate_id))
    if check_failed_attempts(redis_attempts):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="لقد تجاوزت الحد الأقصى لمحاولات الإدخال الفاشلة (5). يرجى طلب رمز جديد."
        )

    otp_row = await fetch_latest_otp(db, graduate_id, purpose)
    if not otp_row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رمز التحقق غير موجود.")

    if otp_row.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رمز التحقق مستخدم مسبقاً.")

    if not validate_otp_expiration(otp_row.expires_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="انتهت صلاحية رمز التحقق.")

    if check_failed_attempts(otp_row.failed_attempts) or check_failed_attempts(redis_attempts):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="لقد تجاوزت الحد الأقصى لمحاولات الإدخال الفاشلة (5). يرجى طلب رمز جديد."
        )

    submitted_hash = hash_otp(code)
    if submitted_hash == otp_row.code_hash:
        await mark_otp_as_used(db, otp_row)
        if purpose == OtpPurpose.EMAIL_VERIFICATION:
            await mark_email_verified(db, graduate_id)
        return {"status": "success", "message": "تم التحقق بنجاح."}
    else:
        attempts = await increment_otp_failed_attempts(db, otp_row)
        if check_failed_attempts(attempts):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="لقد تجاوزت الحد الأقصى لمحاولات الإدخال الفاشلة (5). يرجى طلب رمز جديد."
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"رمز التحقق غير صحيح. المحاولات المتبقية: {5 - attempts}"
        )


async def resend_otp_service(db: AsyncSession, graduate_id: int, purpose: OtpPurpose) -> dict:
    await check_redis_cooldown(str(graduate_id), purpose.value)

    last_otp = await fetch_latest_otp(db, graduate_id, purpose)
    if last_otp:
        check_resend_cooldown_period(last_otp)

    grad = await fetch_graduate(db, graduate_id)
    if not grad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على حساب الخريج.")

    code, _ = await create_and_save_new_otp(db, graduate_id, purpose)
    await dispatch_otp_email(grad.email, code, purpose)

    return {"status": "success", "message": "تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني."}


async def change_email_service(db: AsyncSession, graduate_id: int, new_email: str) -> dict:
    grad = await update_graduate_email_address(db, graduate_id, new_email)
    code, purpose = await create_and_save_new_otp(db, graduate_id, OtpPurpose.EMAIL_VERIFICATION)
    await dispatch_otp_email(new_email, code, OtpPurpose.EMAIL_VERIFICATION)

    return {
        "status": "success",
        "message": "تم تحديث البريد الإلكتروني بنجاح، وإرسال رمز تحقق جديد إلى بريدك الجديد."
    }


async def forgot_password_service(db: AsyncSession, email: str) -> dict:
    success_response = {
        "status": "success",
        "message": "إذا كان هذا البريد مسجلاً، فقد تم إرسال رمز استعادة كلمة المرور."
    }

    grad = await fetch_graduate_by_email(db, email)
    if not grad:
        return success_response

    await check_redis_cooldown(str(grad.id), OtpPurpose.PASSWORD_RESET.value)

    last_otp = await fetch_latest_otp(db, grad.id, OtpPurpose.PASSWORD_RESET)
    if last_otp:
        check_resend_cooldown_period(last_otp)

    code, _ = await create_and_save_new_otp(db, grad.id, OtpPurpose.PASSWORD_RESET)
    await dispatch_otp_email(grad.email, code, OtpPurpose.PASSWORD_RESET)

    return success_response


async def reset_password_service(db: AsyncSession, email: str, code: str, new_password: str) -> dict:
    grad = await fetch_graduate_by_email(db, email)
    if not grad:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="البريد الإلكتروني غير مسجل.")

    redis_attempts = await check_redis_failed_attempts(str(grad.id))
    if check_failed_attempts(redis_attempts):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Request a new code."
        )

    otp_row = await fetch_latest_otp(db, grad.id, OtpPurpose.PASSWORD_RESET)
    if not otp_row or otp_row.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رمز التحقق غير موجود أو مستخدم مسبقاً.")

    if not validate_otp_expiration(otp_row.expires_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="انتهت صلاحية رمز التحقق.")

    if check_failed_attempts(otp_row.failed_attempts) or check_failed_attempts(redis_attempts):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Request a new code."
        )

    submitted_hash = hash_otp(code)
    if submitted_hash != otp_row.code_hash:
        attempts = await increment_otp_failed_attempts(db, otp_row)
        if check_failed_attempts(attempts):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed attempts. Request a new code."
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رمز التحقق غير صحيح.")

    await mark_otp_as_used(db, otp_row)
    await update_graduate_password(db, grad, new_password)

    return {
        "status": "success",
        "message": "Password has been reset successfully."
    }
