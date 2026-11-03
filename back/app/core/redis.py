import os
import logging
import redis.asyncio as redis
from dotenv import load_dotenv

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

async def delete_matching(*patterns: str, batch_size: int = 500) -> None:
    """Delete every key matching the patterns using SCAN (KEYS blocks Redis)."""
    for pattern in patterns:
        batch: list[str] = []
        async for key in redis_client.scan_iter(match=pattern, count=batch_size):
            batch.append(key)
            if len(batch) >= batch_size:
                await redis_client.delete(*batch)
                batch = []
        if batch:
            await redis_client.delete(*batch)


async def get_redis():
    return redis_client
