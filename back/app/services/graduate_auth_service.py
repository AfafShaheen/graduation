from datetime import UTC, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.schemas.auth import GraduateLoginRequest
from app.core.redis import redis_client
from app.core.security import verify_password, create_access_token, SECRET_KEY, ALGORITHM
from jose import jwt


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
    except Exception:
        pass


async def increment_graduate_login_failure(email: str) -> None:
    key = f"graduate_login_attempts:{email}"
    try:
        val = await redis_client.incr(key)
        if val == 1:
            await redis_client.expire(key, 900)  # 15 minutes TTL
    except Exception:
        pass


async def reset_graduate_login_failure(email: str) -> None:
    key = f"graduate_login_attempts:{email}"
    try:
        await redis_client.delete(key)
    except Exception:
        pass


async def login_graduate(data: GraduateLoginRequest, db: AsyncSession) -> dict:
    # 1. Check rate limit
    await check_graduate_login_rate_limit(data.email)

    # 2. Query graduate by email
    stmt = select(GraduateModel).where(GraduateModel.email == data.email)
    result = await db.execute(stmt)
    graduate = result.scalar_one_or_none()

    if not graduate or not verify_password(data.password, graduate.password_hash):
        await increment_graduate_login_failure(data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="البريد الإلكتروني أو كلمة السر غير صحيحة."
        )

    # 3. Check email verification status (FR-5)
    if not graduate.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="البريد الإلكتروني غير مؤكد بعد. يرجى تأكيد البريد عبر رمز OTP أولاً."
        )

    # 4. Reset failed attempts
    await reset_graduate_login_failure(data.email)

    # 5. Generate JWT token
    token = create_access_token({
        "sub": str(graduate.id),
        "graduate_id": graduate.id,
        "role": "graduate",
        "email": graduate.email,
        "university_id": graduate.university_id
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 120 * 60
    }


async def logout_graduate(credentials, current_graduate: GraduateModel) -> dict:
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
