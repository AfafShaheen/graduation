"""Tests for CORS configuration (item 0.4)."""

_ALLOWED_ORIGIN = "http://localhost:5173"


async def test_cors_preflight_allowed_origin(client):
    resp = await client.options(
        "/health",
        headers={
            "Origin": _ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == _ALLOWED_ORIGIN


async def test_cors_preflight_other_origin_not_allowed(client):
    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in resp.headers
