"""Refresh-token lifecycle (P8).

Refresh tokens are long-lived JWTs whose ``jti`` is tracked in Redis so that
tokens can be rotated on every use and reused tokens can be detected. Every
token derived from the same login shares a ``family`` id; if a token that has
already been rotated is presented again, the whole family is revoked.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.redis import redis_client


_REFRESH_KEY = "refresh:{jti}"
_FAMILY_KEY = "refresh_family:{family}"


def _refresh_key(jti: str) -> str:
    return _REFRESH_KEY.format(jti=jti)


def _family_key(family: str) -> str:
    return _FAMILY_KEY.format(family=family)


async def store_refresh_token(
    jti: str, family: str, role: str, subject: str, days: int
) -> None:
    """Register a refresh token's jti as active for ``days`` days."""
    payload = json.dumps({"family": family, "role": role, "subject": subject})
    ttl = int(timedelta(days=days).total_seconds())
    await redis_client.setex(_refresh_key(jti), ttl, payload)
    await redis_client.sadd(_family_key(family), jti)
    await redis_client.expire(_family_key(family), ttl)


async def consume_refresh_token(jti: str, family: str, role: str) -> str:
    """Validate a refresh token and rotate it.

    Returns ``"ok"`` when the token was active (and is now consumed),
    ``"reused"`` when the jti was already consumed for this family (a reuse
    attempt that must revoke the family), or ``"unknown"`` when the token was
    never issued / already expired from Redis.
    """
    key = _refresh_key(jti)
    record = await redis_client.get(key)
    if record is not None:
        await redis_client.delete(key)
        return "ok"
    members = await redis_client.smembers(_family_key(family))
    if jti in members:
        await revoke_family(family)
        return "reused"
    return "unknown"


async def revoke_family(family: str) -> None:
    """Revoke every refresh token that belongs to a family (reuse response)."""
    members = await redis_client.smembers(_family_key(family))
    for member in members:
        await redis_client.delete(_refresh_key(member))
    await redis_client.delete(_family_key(family))


async def revoke_token(jti: str, family: Optional[str] = None) -> None:
    """Revoke a single refresh token (logout), optionally tidying its family."""
    await redis_client.delete(_refresh_key(jti))
    if family:
        await redis_client.srem(_family_key(family), jti)
