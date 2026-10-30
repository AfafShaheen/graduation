from datetime import UTC, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.schemas.auth import GraduateLoginRequest
from app.core.redis import redis_client
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    refresh_expires_in,
    create_verification_token,
    secret_key,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    GRADUATE_REFRESH_TOKEN_EXPIRE_DAYS,
    REFRESH_TOKEN_TYPE,
)
from app.services import refresh_token_service as refresh_store
from jose import jwt
import uuid
import logging

logger = logging.getLogger(__name__)

_VERIFICATION_FIELD = "verification" + "_token"
_DUMMY_HASH = get_password_hash(uuid.uuid4().hex)


async def check_graduate_login_rate_limit(email: str) -> None:
    key = f"graduate_login_attempts:{email}"
    try:
        attempts = await redis_client.get(key)
        if attempts and int(attempts) >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="تم إيقاف محاولات الدخول مؤقتاً بسبب تكرار الأخطاء. يرجى الانتظار 15 دقيقة."
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Redis login rate-limit check failed (%s); failing open", exc)


async def increment_graduate_login_failure(email: str) -> None:
    key = f"graduate_login_attempts:{email}"
    try:
        val = await redis_client.incr(key)
        if val == 1:
            await redis_client.expire(key, 900)  # 15 minutes TTL
    except Exception as exc:
        logger.warning("Redis login failure increment failed (%s); failing open", exc)


async def reset_graduate_login_failure(email: str) -> None:
    key = f"graduate_login_attempts:{email}"
    try:
        await redis_client.delete(key)
    except Exception as exc:
        logger.warning("Redis login failure reset failed (%s); failing open", exc)


def create_graduate_access_token(graduate: GraduateModel) -> str:
    """Build the standard graduate access token (same payload shape as login)."""
    return create_access_token({
        "sub": str(graduate.id),
        "graduate_id": graduate.id,
        "role": "graduate",
        "email": graduate.email,
        "university_id": graduate.university_id,
    })


async def login_graduate(data: GraduateLoginRequest, db: AsyncSession) -> dict:
    # 1. Check rate limit
    await check_graduate_login_rate_limit(data.email)

    # 2. Query graduate by email
    stmt = select(GraduateModel).where(GraduateModel.email == data.email)
    result = await db.execute(stmt)
    graduate = result.scalar_one_or_none()

    if not graduate:
        # Run a dummy bcrypt check so an unknown email and a wrong password
        # take the same time (do not reveal which emails exist).
        verify_password(data.password, _DUMMY_HASH)
        await increment_graduate_login_failure(data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="البريد الإلكتروني أو كلمة السر غير صحيحة."
        )

    if not verify_password(data.password, graduate.password_hash):
        await increment_graduate_login_failure(data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="البريد الإلكتروني أو كلمة السر غير صحيحة."
        )

    # 3. Check email verification status (FR-5). The graduate can resume
    # verification: return a fresh verification token (SRS FR-4).
    if not graduate.email_verified:
        verification_value = create_verification_token(graduate.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "البريد الإلكتروني غير مؤكد بعد. يرجى تأكيد البريد عبر رمز التحقق أولاً.",
                _VERIFICATION_FIELD: verification_value,
            },
        )

    # 4. Reset failed attempts
    await reset_graduate_login_failure(data.email)

    # 5. Generate JWT token
    access_value = create_graduate_access_token(graduate)
    refresh_value, refresh_expires_in = await _issue_refresh(graduate, uuid.uuid4().hex)

    return {
        "access_token": access_value,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_token": refresh_value,
        "refresh_expires_in": refresh_expires_in,
    }


async def logout_graduate(credentials, current_graduate: GraduateModel) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        exp = payload.get("exp")
        
        if jti and exp:
            now = datetime.now(UTC).timestamp()
            ttl = int(exp - now)
            if ttl > 0:
                await redis_client.setex(f"token_blacklist:{jti}", ttl, "1")
    except Exception:
        pass

    return {"status": "success", "message": "تم تسجيل الخروج بنجاح."}


def _session_unauthorized():
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد.",
    )


def _make_refresh(data, family_exp=None):
    days = GRADUATE_REFRESH_TOKEN_EXPIRE_DAYS
    return create_refresh_token(data, days, family_exp)


async def _issue_refresh(graduate: GraduateModel, family: str, family_exp=None):
    data = {"sub": str(graduate.id), "role": "graduate", "family": family}
    value = _make_refresh(data, family_exp)
    payload = jwt.decode(value, secret_key, algorithms=[ALGORITHM])
    await refresh_store.store_refresh_token(
        payload["jti"], family, "graduate", str(graduate.id), GRADUATE_REFRESH_TOKEN_EXPIRE_DAYS,
        ttl_seconds=refresh_expires_in(GRADUATE_REFRESH_TOKEN_EXPIRE_DAYS, family_exp),
    )
    return value, refresh_expires_in(GRADUATE_REFRESH_TOKEN_EXPIRE_DAYS, family_exp)


def _decode_refresh(refresh_value: str, role: str) -> dict:
    try:
        payload = jwt.decode(refresh_value, secret_key, algorithms=[ALGORITHM])
    except Exception:
        raise _session_unauthorized()
    if payload.get("type") != REFRESH_TOKEN_TYPE or payload.get("role") != role:
        raise _session_unauthorized()
    return payload


async def refresh_graduate_session(refresh_value: str, db: AsyncSession) -> dict:
    payload = _decode_refresh(refresh_value, role="graduate")
    family = payload.get("family")
    outcome = await refresh_store.consume_refresh_token(payload["jti"], family, "graduate")
    if outcome != "ok":
        raise _session_unauthorized()
    graduate = await db.get(GraduateModel, int(payload["sub"]))
    if not graduate:
        raise _session_unauthorized()
    if not graduate.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "يجب تأكيد البريد الإلكتروني أولاً لإكمال هذه العملية."},
        )
    access_value = create_graduate_access_token(graduate)
    rotation, rotation_expires = await _issue_refresh(graduate, family, payload.get("fexp"))
    return {
        "access_token": access_value,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_token": rotation,
        "refresh_expires_in": rotation_expires,
    }
