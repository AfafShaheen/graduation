import os
import json
import logging
import redis.asyncio as redis
from dotenv import load_dotenv
from functools import wraps

load_dotenv()
logger = logging.getLogger(__name__)

# Empty/unset REDIS_URL: point at a closed port so every call fails fast
# (callers with fail-open paths then skip the cache). Socket timeouts keep a
# hung Redis from hanging requests.
# Prefix of the cached dashboard statistics (see services/stats_v2_service.py).
STATS_V2_CACHE_PREFIX = "admin:stats:v2"

REDIS_URL = os.getenv("REDIS_URL") or "redis://127.0.0.1:9/9"

redis_client = redis.from_url(
    REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=2,
)

async def get_redis():
    return redis_client

def cache_response(expire_seconds: int = 60):
    """Caching decorator for FastAPI endpoints to speed up responses using Redis across all endpoints."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"cache:{func.__name__}:{str(args)}:{str(kwargs)}"
            try:
                cached_data = await redis_client.get(cache_key)
                if cached_data:
                    return json.loads(cached_data)
            except Exception:
                logger.warning("Redis cache read failed for %s", cache_key, exc_info=True)

            result = await func(*args, **kwargs)

            try:
                await redis_client.setex(cache_key, expire_seconds, json.dumps(result, default=str))
            except Exception:
                logger.warning("Redis cache write failed for %s", cache_key, exc_info=True)

            return result
        return wrapper
    return decorator
