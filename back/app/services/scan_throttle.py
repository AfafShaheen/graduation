"""Limits wrong short codes typed by hand at the scanner.

A QR image carries a full UUID that nobody can guess. The short code is much shorter, so after
10 wrong ones within 5 minutes a scanner has to wait (the counter simply expires). Redis outages
fail open, like the other throttles.
"""
import logging

from fastapi import HTTPException, status

from app.core import messages
from app.core.redis import redis_client

logger = logging.getLogger(__name__)

FAILURE_LIMIT = 10
WINDOW_SECONDS = 300


def _key(scanner_id: int) -> str:
    return f"scan_short_code_failures:{scanner_id}"


async def check(scanner_id: int) -> None:
    try:
        count = await redis_client.get(_key(scanner_id))
        if count and int(count) >= FAILURE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=messages.SCAN_TOO_MANY_ATTEMPTS,
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Redis scan throttle check failed (%s); failing open", exc)


async def record_failure(scanner_id: int) -> None:
    try:
        key = _key(scanner_id)
        await redis_client.set(key, 0, ex=WINDOW_SECONDS, nx=True)
        await redis_client.incr(key)
    except Exception as exc:
        logger.warning("Redis scan throttle increment failed (%s); failing open", exc)
