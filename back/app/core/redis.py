import os
import json
import redis.asyncio as redis
from dotenv import load_dotenv
from functools import wraps

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

redis_client = redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)

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
                pass

            result = await func(*args, **kwargs)

            try:
                await redis_client.setex(cache_key, expire_seconds, json.dumps(result, default=str))
            except Exception:
                pass

            return result
        return wrapper
    return decorator
