"""Login throttling shared by the admin, scanner and graduate logins.

Two counters per attempt, both with a 15 minute window:

* per account **and** client IP: 5 failures lock that IP out of that account;
* per account only: 20 failures lock the account for everyone (a distributed
  guessing attempt), which is far above what one legitimate user can reach.

So a single attacker can no longer lock another person's account by sending a
few bad passwords from a different address. Redis outages fail open, as before.
"""
import logging
import os

from fastapi import HTTPException, status

from app.core.redis import redis_client

logger = logging.getLogger(__name__)

IP_ATTEMPT_LIMIT = 5
ACCOUNT_ATTEMPT_LIMIT = 20
WINDOW_SECONDS = 900

_LOCKED_MESSAGE = "تم إيقاف محاولات الدخول مؤقتاً بسبب تكرار الأخطاء. يرجى الانتظار 15 دقيقة."


def client_ip(request) -> str:
    """Best-effort client address.

    Behind a proxy that appends to ``X-Forwarded-For`` (nginx does), the entry
    written by the last trusted proxy is the real client. ``TRUSTED_PROXY_HOPS``
    (default 1) says how many proxies sit in front of the app; earlier entries
    are client-controlled and are ignored.
    """
    try:
        hops = max(0, int(os.getenv("TRUSTED_PROXY_HOPS", "1") or 1))
    except ValueError:
        hops = 1
    forwarded = request.headers.get("x-forwarded-for", "")
    parts = [part.strip() for part in forwarded.split(",") if part.strip()]
    if hops and len(parts) >= hops:
        return parts[-hops]
    return request.client.host if request.client else "unknown"


def _keys(scope: str, identifier: str, ip: str | None) -> tuple[str, str]:
    account = f"{scope}_login_attempts:{identifier}"
    return account, f"{account}:{ip or 'unknown'}"


async def check(scope: str, identifier: str, ip: str | None) -> None:
    account_key, ip_key = _keys(scope, identifier, ip)
    try:
        account_attempts = await redis_client.get(account_key)
        ip_attempts = await redis_client.get(ip_key)
        if (
            account_attempts and int(account_attempts) >= ACCOUNT_ATTEMPT_LIMIT
        ) or (ip_attempts and int(ip_attempts) >= IP_ATTEMPT_LIMIT):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=_LOCKED_MESSAGE
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Redis %s login rate-limit check failed (%s); failing open", scope, exc)


async def record_failure(scope: str, identifier: str, ip: str | None) -> None:
    try:
        for key in _keys(scope, identifier, ip):
            # SET NX EX then INCR: the key always carries its expiry.
            await redis_client.set(key, 0, ex=WINDOW_SECONDS, nx=True)
            await redis_client.incr(key)
    except Exception as exc:
        logger.warning("Redis %s login failure increment failed (%s); failing open", scope, exc)


async def reset(scope: str, identifier: str, ip: str | None) -> None:
    try:
        await redis_client.delete(*_keys(scope, identifier, ip))
    except Exception as exc:
        logger.warning("Redis %s login failure reset failed (%s); failing open", scope, exc)
