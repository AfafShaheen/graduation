import logging
import os

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.admin import AdminModel
from app.models.graduate import GraduateModel
from app.models.scanner import ScannerModel
from app.core.redis import redis_client
from app.core import messages
from app.core.security import secret_key, ALGORITHM
from jose import jwt, JWTError

logger = logging.getLogger(__name__)


def _auth_redis_fail_open() -> bool:
    return os.getenv("AUTH_REDIS_FAIL_OPEN", "").strip().lower() in ("1", "true", "yes", "on")


async def _blacklist_lookup(jti: str):
    try:
        return await redis_client.get(f"token_blacklist:{jti}")
    except Exception:
        if not _auth_redis_fail_open():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=messages.SERVICE_UNAVAILABLE,
            )
        # Fail open: never log the full token, the jti alone is fine.
        logger.warning("auth blacklist lookup failed for jti %s (fail-open)", jti)
        return None


security = HTTPBearer()

async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Dependency to protect admin endpoints using standard HTTPBearer and centralized security settings."""
    if not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="غير مصرح، يجب تسجيل دخول المسؤول."
        )

    try:
        payload = jwt.decode(credentials.credentials, secret_key, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        role = payload.get("role")
        admin_id = payload.get("sub")

        if role != "admin" or not admin_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحيات المسؤول."
            )

        if jti:
            blacklisted = await _blacklist_lookup(jti)
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


async def get_current_scanner(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> ScannerModel:
    """Dependency to protect scanner endpoints (FR-23/24/25)."""
    if not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="غير مصرح، يجب تسجيل دخول الماسح الضوئي."
        )

    try:
        payload = jwt.decode(credentials.credentials, secret_key, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        role = payload.get("role")
        scanner_id = payload.get("sub") or payload.get("scanner_id")

        if role != "scanner" or not scanner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحيات الماسح الضوئي."
            )

        if jti:
            blacklisted = await _blacklist_lookup(jti)
            if blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً."
                )

        scanner = await db.get(ScannerModel, int(scanner_id))
        if not scanner:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="حساب الماسح الضوئي غير موجود."
            )

        return scanner

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
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        role = payload.get("role")
        graduate_id = payload.get("sub") or payload.get("graduate_id")

        if role != "graduate" or not graduate_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحيات خريج."
            )

        if jti:
            blacklisted = await _blacklist_lookup(jti)
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


async def get_verification_graduate_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    """Validate a short-lived email-verification token (SRS FR-4).

    Only tokens with purpose='email_verification' are accepted, so access and
    registration tokens are rejected. Returns the graduate id taken from the
    token; callers must never accept the id from the request body.
    """
    raw = credentials.credentials
    try:
        payload = jwt.decode(raw, secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز التحقق غير صالح أو انتهت صلاحيته. يرجى طلب رمز جديد."
        )

    if payload.get("purpose") != "email_verification":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز التحقق غير صالح."
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز التحقق غير صالح."
        )

    return int(sub)
