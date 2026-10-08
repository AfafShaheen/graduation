from datetime import UTC, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.admin import AdminModel
from app.schemas.admin_auth import AdminLoginRequest
from app.core.redis import redis_client
from app.core.security import verify_password, create_access_token, SECRET_KEY, ALGORITHM
from jose import jwt


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
    except Exception:
        pass


async def increment_login_failure(username: str) -> None:
    key = f"admin_login_attempts:{username}"
    try:
        val = await redis_client.incr(key)
        if val == 1:
            await redis_client.expire(key, 900)  # 15 minutes TTL
    except Exception:
        pass


async def reset_login_failure(username: str) -> None:
    key = f"admin_login_attempts:{username}"
    try:
        await redis_client.delete(key)
    except Exception:
        pass


async def login_admin(data: AdminLoginRequest, db: AsyncSession) -> dict:
    await check_login_rate_limit(data.username)

    stmt = select(AdminModel).where(AdminModel.username == data.username)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin or not (data.password == admin.password_hash):
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

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 120 * 60
    }


async def logout_admin(credentials, admin: dict) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
