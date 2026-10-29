import asyncio
import time
from datetime import UTC, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.models.otp_code import OtpCodeModel
from app.services.email_service import (
    OtpPurpose,
    generate_otp,
    hash_otp,
    send_otp_email,
    OTP_TTL_MINUTES,
    RESEND_COOLDOWN_SECONDS,
)
from app.core.redis import redis_client
from app.core.database import AsyncSessionLocal
from app.core import messages
from app.core.security import ACCESS_TOKEN_EXPIRE_MINUTES
from app.services.graduate_auth_service import create_graduate_access_token
import hmac
import bcrypt
import logging

logger = logging.getLogger(__name__)

# forgot-password: send inside the request, but always take at least this long
# so the response time doesn't reveal whether the email is registered (item 2.5-8).
FORGOT_PASSWORD_MIN_SECONDS = 3.0
FORGOT_PASSWORD_SEND_TIMEOUT = 20.0


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
    except Exception as exc:
        logger.warning("Redis cooldown check failed (%s); failing open", exc)


async def set_redis_cooldown(identifier: str, action: str, seconds: int = 60) -> None:
    key = f"cooldown:{action}:{identifier}"
    try:
        await redis_client.setex(key, seconds, "1")
    except Exception as exc:
        logger.warning("Redis cooldown write failed (%s); failing open", exc)


async def check_redis_failed_attempts(identifier: str) -> int:
    key = f"attempts:otp:{identifier}"
    try:
        val = await redis_client.get(key)
        return int(val) if val else 0
    except Exception as exc:
        logger.warning("Redis failed-attempts read failed (%s); failing open", exc)
        return 0


async def increment_redis_failed_attempts(identifier: str) -> int:
    key = f"attempts:otp:{identifier}"
    try:
        val = await redis_client.incr(key)
        await redis_client.expire(key, 600)  # 10 mins TTL
        return val
    except Exception as exc:
        logger.warning("Redis failed-attempts increment failed (%s); failing open", exc)
        return 1


async def reset_redis_failed_attempts(identifier: str) -> None:
    key = f"attempts:otp:{identifier}"
    try:
        await redis_client.delete(key)
    except Exception as exc:
        logger.warning("Redis failed-attempts reset failed (%s); failing open", exc)


async def fetch_latest_otp(
    db: AsyncSession,
    graduate_id: int,
    purpose: OtpPurpose,
    *,
    for_update: bool = False,
) -> OtpCodeModel | None:
    stmt = (
        select(OtpCodeModel)
        .where(
            OtpCodeModel.graduate_id == graduate_id,
            OtpCodeModel.purpose == purpose.value,
        )
        .order_by(OtpCodeModel.id.desc())
        .limit(1)
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def fetch_graduate(db: AsyncSession, graduate_id: int) -> GraduateModel | None:
    stmt = select(GraduateModel).where(GraduateModel.id == graduate_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def fetch_graduate_by_email(db: AsyncSession, email: str) -> GraduateModel | None:
    # Case-insensitive: "Name@Gmail.com" at registration and "name@gmail.com" at
    # reset are the same mailbox. An exact match silently found no account.
    stmt = (
        select(GraduateModel)
        .where(func.lower(GraduateModel.email) == (email or "").strip().lower())
        .order_by(GraduateModel.id)
    )
    result = await db.execute(stmt)
    return result.scalars().first()


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


async def issue_and_send_otp(db: AsyncSession, graduate: GraduateModel, purpose: OtpPurpose, to_email: str) -> bool:
    """Create a fresh OTP, send it, and arm the cooldown only after success.

    The OTP row is committed before sending so a mail failure still leaves a
    usable code that the user can resend. Returns True when the email was sent.
    """
    code = generate_otp()
    expires_at = datetime.now(UTC) + timedelta(minutes=OTP_TTL_MINUTES)
    db.add(OtpCodeModel(
        graduate_id=graduate.id,
        purpose=purpose.value,
        code_hash=hash_otp(code),
        expires_at=expires_at,
        failed_attempts=0,
    ))
    await db.commit()

    sent = await asyncio.to_thread(send_otp_email, to_email, code, purpose)
    if sent:
        await set_redis_cooldown(str(graduate.id), purpose.value, RESEND_COOLDOWN_SECONDS)
        await reset_redis_failed_attempts(str(graduate.id))
    return sent


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

    otp_row = await fetch_latest_otp(db, graduate_id, purpose, for_update=True)
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
    if hmac.compare_digest(submitted_hash, otp_row.code_hash):
        await mark_otp_as_used(db, otp_row)
        if purpose == OtpPurpose.EMAIL_VERIFICATION:
            await mark_email_verified(db, graduate_id)
            grad = await fetch_graduate(db, graduate_id)
            access_value = create_graduate_access_token(grad)
            return {
                "status": "success",
                "message": "تم التحقق بنجاح.",
                "access_token": access_value,
                "token_type": "bearer",
                "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            }
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

    grad = await fetch_graduate(db, graduate_id)
    if not grad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على حساب الخريج.")

    sent = await issue_and_send_otp(db, grad, purpose, grad.email)
    if not sent:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=messages.EMAIL_SEND_FAIL)

    return {"status": "success", "message": "تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني."}


async def change_email_service(db: AsyncSession, graduate_id: int, new_email: str) -> dict:
    grad = await update_graduate_email_address(db, graduate_id, new_email)
    sent = await issue_and_send_otp(db, grad, OtpPurpose.EMAIL_VERIFICATION, new_email)
    if not sent:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=messages.EMAIL_SEND_FAIL)

    return {
        "status": "success",
        "message": "تم تحديث البريد الإلكتروني بنجاح، وإرسال رمز تحقق جديد إلى بريدك الجديد."
    }


async def _send_password_reset_otp(email: str) -> str:
    """Look up the graduate and send a reset OTP. Never raises.

    Returns an outcome tag for logging only (never sent to the client):
    'no_account' | 'cooldown' | 'sent' | 'send_failed' | 'error'.
    """
    try:
        async with AsyncSessionLocal() as session:
            grad = await fetch_graduate_by_email(session, email)
            if not grad:
                return "no_account"
            try:
                await check_redis_cooldown(str(grad.id), OtpPurpose.PASSWORD_RESET.value)
            except HTTPException:
                return "cooldown"
            sent = await issue_and_send_otp(session, grad, OtpPurpose.PASSWORD_RESET, grad.email)
            if not sent:
                logger.warning("Password-reset OTP send failed for graduate id=%s", grad.id)
                return "send_failed"
            return "sent"
    except Exception as exc:
        logger.warning("Password-reset OTP failed (%s): %s", type(exc).__name__, exc)
        logger.error("Password-reset OTP failed (%s): %s", type(exc).__name__, exc)
        return "error"


async def forgot_password_service(db: AsyncSession, email: str) -> dict:
    success_response = {
        "status": "success",
        "message": "إذا كان هذا البريد مسجلاً، فقد تم إرسال رمز استعادة كلمة المرور."
    }
    started = time.monotonic()
    try:
        outcome = await asyncio.wait_for(
            _send_password_reset_otp(email), timeout=FORGOT_PASSWORD_SEND_TIMEOUT
        )
    except asyncio.TimeoutError:
        logger.warning("Password-reset OTP timed out after %s seconds", FORGOT_PASSWORD_SEND_TIMEOUT)
        outcome = "timeout"
    # Log the outcome without the email address or the code.
    # WARNING level so it reaches stderr.log on the server (no email, no code).
    logger.warning("forgot-password processed: outcome=%s", outcome)
    elapsed = time.monotonic() - started
    if elapsed < FORGOT_PASSWORD_MIN_SECONDS:
        await asyncio.sleep(FORGOT_PASSWORD_MIN_SECONDS - elapsed)
    return success_response


async def reset_password_service(db: AsyncSession, email: str, code: str, new_password: str) -> dict:
    grad = await fetch_graduate_by_email(db, email)
    if not grad:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID_GENERIC)

    redis_attempts = await check_redis_failed_attempts(str(grad.id))
    if check_failed_attempts(redis_attempts):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID_GENERIC)

    otp_row = await fetch_latest_otp(db, grad.id, OtpPurpose.PASSWORD_RESET, for_update=True)
    if not otp_row or otp_row.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID_GENERIC)

    if not validate_otp_expiration(otp_row.expires_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID_GENERIC)

    if check_failed_attempts(otp_row.failed_attempts) or check_failed_attempts(redis_attempts):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID_GENERIC)

    submitted_hash = hash_otp(code)
    if not hmac.compare_digest(submitted_hash, otp_row.code_hash):
        await increment_otp_failed_attempts(db, otp_row)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.OTP_INVALID_GENERIC)

    await mark_otp_as_used(db, otp_row)
    await update_graduate_password(db, grad, new_password)

    return {
        "status": "success",
        "message": messages.PASSWORD_RESET_SUCCESS
    }
