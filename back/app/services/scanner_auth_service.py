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
    SCANNER_REFRESH_TOKEN_EXPIRE_DAYS,
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    refresh_expires_in,
    get_password_hash,
    secret_key,
    verify_password,
)
from app.models.event import EventModel
from app.models.scanner import ScannerModel
from app.schemas.scanner_auth import ScannerLoginRequest
from app.services import refresh_token_service as refresh_store

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

    result = await db.execute(
        select(ScannerModel).where(ScannerModel.username == data.username)
    )
    candidates = list(result.scalars().all())

    if not candidates:
        verify_password(data.password, _DUMMY_HASH)
        await increment_scanner_login_failure(data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=messages.SCANNER_LOGIN_FAILED,
        )

    matches = [
        scanner
        for scanner in candidates
        if verify_password(data.password, scanner.password_hash)
    ]

    if data.event_id is not None:
        matches = [scanner for scanner in matches if scanner.event_id == data.event_id]

    if not matches:
        await increment_scanner_login_failure(data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=messages.SCANNER_LOGIN_FAILED,
        )

    if len(matches) > 1:
        matching_event_ids = [scanner.event_id for scanner in matches]
        events = (
            await db.execute(
                select(EventModel)
                .where(EventModel.id.in_(matching_event_ids))
                .order_by(EventModel.event_date, EventModel.id)
            )
        ).scalars().all()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": messages.SCANNER_EVENT_REQUIRED,
                "code": "SCANNER_EVENT_REQUIRED",
                "events": [
                    {
                        "id": event.id,
                        "name": event.name,
                        "event_date": event.event_date.isoformat(),
                    }
                    for event in events
                ],
            },
        )

    scanner = matches[0]

    await reset_scanner_login_failure(data.username)

    access_value = create_scanner_access_token(scanner)

    event = await db.get(EventModel, scanner.event_id)

    refresh_value, refresh_expires_in = await _issue_refresh(scanner, uuid.uuid4().hex)

    return {
        "access_token": access_value,
        "token_type": "bearer",
        "expires_in": SCANNER_TOKEN_EXPIRE_HOURS * 3600,
        "refresh_token": refresh_value,
        "refresh_expires_in": refresh_expires_in,
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


def _session_unauthorized():
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد.",
    )


def _make_refresh(data, family_exp=None):
    days = SCANNER_REFRESH_TOKEN_EXPIRE_DAYS
    return create_refresh_token(data, days, family_exp)


async def _issue_refresh(scanner: ScannerModel, family: str, family_exp=None):
    data = {"sub": str(scanner.id), "role": "scanner", "family": family}
    value = _make_refresh(data, family_exp)
    payload = jwt.decode(value, secret_key, algorithms=[ALGORITHM])
    await refresh_store.store_refresh_token(
        payload["jti"], family, "scanner", str(scanner.id), SCANNER_REFRESH_TOKEN_EXPIRE_DAYS,
        ttl_seconds=refresh_expires_in(SCANNER_REFRESH_TOKEN_EXPIRE_DAYS, family_exp),
    )
    return value, refresh_expires_in(SCANNER_REFRESH_TOKEN_EXPIRE_DAYS, family_exp)


def _decode_refresh(refresh_value: str, role: str) -> dict:
    try:
        payload = jwt.decode(refresh_value, secret_key, algorithms=[ALGORITHM])
    except Exception:
        raise _session_unauthorized()
    if payload.get("type") != REFRESH_TOKEN_TYPE or payload.get("role") != role:
        raise _session_unauthorized()
    return payload


async def refresh_scanner_session(refresh_value: str, db: AsyncSession) -> dict:
    payload = _decode_refresh(refresh_value, role="scanner")
    family = payload.get("family")
    outcome = await refresh_store.consume_refresh_token(payload["jti"], family, "scanner")
    if outcome != "ok":
        raise _session_unauthorized()
    scanner = await db.get(ScannerModel, int(payload["sub"]))
    if not scanner:
        raise _session_unauthorized()
    access_value = create_scanner_access_token(scanner)
    event = await db.get(EventModel, scanner.event_id)
    rotation, rotation_expires = await _issue_refresh(scanner, family, payload.get("fexp"))
    return {
        "access_token": access_value,
        "token_type": "bearer",
        "expires_in": SCANNER_TOKEN_EXPIRE_HOURS * 3600,
        "refresh_token": rotation,
        "refresh_expires_in": rotation_expires,
        "event": event,
    }
