from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.admin import AdminModel
from app.models.graduate import GraduateModel
from app.core.redis import redis_client
from app.core.security import SECRET_KEY, ALGORITHM
from jose import jwt, JWTError

security = HTTPBearer()

async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Dependency to protect admin endpoints using standard HTTPBearer and centralized security settings."""
    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="غير مصرح، يجب تسجيل دخول المسؤول."
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        role = payload.get("role")
        admin_id = payload.get("sub")

        if role != "admin" or not admin_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحيات المسؤول."
            )

        if jti:
            blacklisted = await redis_client.get(f"token_blacklist:{jti}")
            if blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً."
                )

        admin = await db.get(AdminModel, int(admin_id))
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="حساب المسؤول غير موجود."
            )

        return {"admin_id": admin.id, "username": admin.username}

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز المصادقة غير صالح أو انتهت صلاحيته."
        )


async def get_current_graduate(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> GraduateModel:
    """Dependency to protect graduate endpoints (FR-5 / UC-2):

    - Extracts JWT token
    - Checks Redis token blacklist
    - Verifies role == 'graduate'
    - Confirms graduate exists in DB
    - Checks graduate.email_verified == True (returns HTTP 403 if False)
    """
    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="غير مصرح، يجب تسجيل الدخول."
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        role = payload.get("role")
        graduate_id = payload.get("sub") or payload.get("graduate_id")

        if role != "graduate" or not graduate_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحيات خريج."
            )

        if jti:
            blacklisted = await redis_client.get(f"token_blacklist:{jti}")
            if blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً."
                )

        graduate = await db.get(GraduateModel, int(graduate_id))
        if not graduate:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="حساب الخريج غير موجود."
            )

        if not graduate.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="يجب تأكيد البريد الإلكتروني أولاً لتتمكن من متابعة الطلب."
            )

        return graduate

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز المصادقة غير صالح أو انتهت صلاحيته."
        )
