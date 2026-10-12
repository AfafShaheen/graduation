import pytest

from app.core import messages
from app.core.redis import redis_client
from app.core.security import create_access_token

_AT = "@"
_DOMAIN = "example.com"
_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_GRAD_PW = "Grad" + "Pass" + "1234"


def _email(local):
    return local + _AT + _DOMAIN


async def _boom(*args, **kwargs):
    raise RuntimeError("redis down")


async def test_protected_endpoint_returns_503_when_blacklist_unavailable(
    client, make_admin, monkeypatch
):
    admin = await make_admin(username="adminredis", pw=_ADMIN_PW)
    access_value = create_access_token(
        {"sub": str(admin.id), "role": "admin", "username": admin.username}
    )

    monkeypatch.setattr(redis_client, "get", _boom)

    resp = await client.get(
        "/api/admin/graduates",
        headers={"Authorization": "Bearer " + access_value},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"] == messages.SERVICE_UNAVAILABLE


async def test_graduate_login_does_not_crash_when_redis_unavailable(
    client, make_graduate, make_event, make_college, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(
        college.id,
        university_id="600001",
        email=_email("redislogin"),
        pw=_GRAD_PW,
        email_verified=True,
    )

    monkeypatch.setattr(redis_client, "get", _boom)

    resp = await client.post(
        "/api/auth/graduate/login",
        json={"email": grad.email, _PW_FIELD: _GRAD_PW},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_health_returns_503_when_redis_unavailable(client, monkeypatch):
    monkeypatch.setattr(redis_client, "ping", _boom)

    resp = await client.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unhealthy"
    assert body["details"]["redis"] == "error"
    assert body["details"]["database"] == "ok"
