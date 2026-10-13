"""Scanner authentication (FR-23, D11).

Scanner sessions mirror the admin/graduate login patterns: a Redis
failed-attempt counter (fail-open), a dummy bcrypt check for unknown
usernames so timing does not reveal which accounts exist, and a single
generic error message. The issued token carries ``role="scanner"`` and lives
for 12 hours (D11) instead of the regular 2-hour access-token lifetime.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.core.redis import redis_client
from app.core.security import (
    ALGORITHM,
    create_access_token,
    get_password_hash,
    secret_key,
    verify_password,
)
from app.models.event import EventModel
from app.models.scanner import ScannerModel
from app.schemas.scanner_auth import ScannerLoginRequest

logger = logging.getLogger(__name__)

SCANNER_TOKEN_EXPIRE_HOURS = 12
_DUMMY_HASH = get_password_hash(uuid.uuid4().hex)


async def check_scanner_login_rate_limit(username: str) -> None:
    key = f"scanner_login_attempts:{username}"
    try:
        attempts = await redis_client.get(key)
        if attempts and int(attempts) >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="تم إيقاف محاولات الدخول مؤقتاً بسبب تكرار الأخطاء. يرجى الانتظار 15 دقيقة.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Redis scanner login rate-limit check failed (%s); failing open", exc)


async def increment_scanner_login_failure(username: str) -> None:
    key = f"scanner_login_attempts:{username}"
    try:
        val = await redis_client.incr(key)
        if val == 1:
            await redis_client.expire(key, 900)
    except Exception as exc:
        logger.warning("Redis scanner login failure increment failed (%s); failing open", exc)


async def reset_scanner_login_failure(username: str) -> None:
    key = f"scanner_login_attempts:{username}"
    try:
        await redis_client.delete(key)
    except Exception as exc:
        logger.warning("Redis scanner login failure reset failed (%s); failing open", exc)


def create_scanner_access_token(scanner: ScannerModel) -> str:
    """Build a scanner token (D11).

    The event is carried for convenience only; every protected route must read
    the scanner row from the database rather than trust this claim.
    """
    return create_access_token(
        {
            "sub": str(scanner.id),
            "scanner_id": scanner.id,
            "role": "scanner",
            "event_id": scanner.event_id,
        },
        expires_delta=timedelta(hours=SCANNER_TOKEN_EXPIRE_HOURS),
    )


async def login_scanner(data: ScannerLoginRequest, db: AsyncSession) -> dict:
    await check_scanner_login_rate_limit(data.username)

    scanner = (
        await db.execute(select(ScannerModel).where(ScannerModel.username == data.username))
    ).scalar_one_or_none()

    if not scanner:
        verify_password(data.password, _DUMMY_HASH)
        await increment_scanner_login_failure(data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=messages.SCANNER_LOGIN_FAILED,
        )

    if not verify_password(data.password, scanner.password_hash):
        await increment_scanner_login_failure(data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=messages.SCANNER_LOGIN_FAILED,
        )

    await reset_scanner_login_failure(data.username)

    access_value = create_scanner_access_token(scanner)

    event = await db.get(EventModel, scanner.event_id)

    return {
        "access_token": access_value,
        "token_type": "bearer",
        "expires_in": SCANNER_TOKEN_EXPIRE_HOURS * 3600,
        "event": event,
    }


async def logout_scanner(credentials, scanner: ScannerModel) -> dict:
    raw = credentials.credentials
    try:
        payload = jwt.decode(raw, secret_key, algorithms=[ALGORITHM])
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
