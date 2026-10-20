from datetime import UTC, datetime
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.admin import AdminModel
from app.schemas.admin_auth import AdminLoginRequest
from app.core.redis import redis_client
from app.core.security import (
    ALGORITHM,
    ADMIN_REFRESH_TOKEN_EXPIRE_DAYS,
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    get_password_hash,
    secret_key,
    verify_password,
)
from app.services import refresh_token_service as refresh_store
from jose import jwt
import logging

logger = logging.getLogger(__name__)

_DUMMY_HASH = get_password_hash(uuid.uuid4().hex)


async def check_login_rate_limit(username: str) -> None:
    key = f"admin_login_attempts:{username}"
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
        logger.warning("Redis admin login rate-limit check failed (%s); failing open", exc)


async def increment_login_failure(username: str) -> None:
    key = f"admin_login_attempts:{username}"
    try:
        val = await redis_client.incr(key)
        if val == 1:
            await redis_client.expire(key, 900)  # 15 minutes TTL
    except Exception as exc:
        logger.warning("Redis admin login failure increment failed (%s); failing open", exc)


async def reset_login_failure(username: str) -> None:
    key = f"admin_login_attempts:{username}"
    try:
        await redis_client.delete(key)
    except Exception as exc:
        logger.warning("Redis admin login failure reset failed (%s); failing open", exc)


async def login_admin(data: AdminLoginRequest, db: AsyncSession) -> dict:
    await check_login_rate_limit(data.username)

    stmt = select(AdminModel).where(AdminModel.username == data.username)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin:
        # Run a dummy bcrypt check so an unknown username and a wrong password
        # take the same time (do not reveal which usernames exist).
        verify_password(data.password, _DUMMY_HASH)
        await increment_login_failure(data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة السر غير صحيحة."
        )

    if not verify_password(data.password, admin.password_hash):
        await increment_login_failure(data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة السر غير صحيحة."
        )

    await reset_login_failure(data.username)

    token = create_access_token({
        "sub": str(admin.id),
        "role": "admin",
        "username": admin.username
    })

    refresh_value, refresh_expires_in = await _issue_refresh(admin, uuid.uuid4().hex)

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 120 * 60,
        "refresh_token": refresh_value,
        "refresh_expires_in": refresh_expires_in,
    }


async def logout_admin(credentials, admin: dict) -> dict:
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


def _make_refresh(data):
    days = ADMIN_REFRESH_TOKEN_EXPIRE_DAYS
    return create_refresh_token(data, days)


async def _issue_refresh(admin: AdminModel, family: str):
    data = {"sub": str(admin.id), "role": "admin", "family": family}
    value = _make_refresh(data)
    payload = jwt.decode(value, secret_key, algorithms=[ALGORITHM])
    await refresh_store.store_refresh_token(
        payload["jti"], family, "admin", str(admin.id), ADMIN_REFRESH_TOKEN_EXPIRE_DAYS
    )
    return value, ADMIN_REFRESH_TOKEN_EXPIRE_DAYS * 86400


def _decode_refresh(refresh_value: str, role: str) -> dict:
    try:
        payload = jwt.decode(refresh_value, secret_key, algorithms=[ALGORITHM])
    except Exception:
        raise _session_unauthorized()
    if payload.get("type") != REFRESH_TOKEN_TYPE or payload.get("role") != role:
        raise _session_unauthorized()
    return payload


async def refresh_admin_session(refresh_value: str, db: AsyncSession) -> dict:
    payload = _decode_refresh(refresh_value, role="admin")
    family = payload.get("family")
    outcome = await refresh_store.consume_refresh_token(payload["jti"], family, "admin")
    if outcome != "ok":
        raise _session_unauthorized()
    admin = await db.get(AdminModel, int(payload["sub"]))
    if not admin:
        raise _session_unauthorized()
    access_value = create_access_token({
        "sub": str(admin.id),
        "role": "admin",
        "username": admin.username,
    })
    rotation, rotation_expires = await _issue_refresh(admin, family)
    return {
        "access_token": access_value,
        "token_type": "bearer",
        "expires_in": 120 * 60,
        "refresh_token": rotation,
        "refresh_expires_in": rotation_expires,
    }
