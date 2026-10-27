"""Trivial smoke test proving the harness (DB, Redis, HTTP client) works."""


async def test_health_endpoint(client):
    response = await client.get("/health")
    assert response.status_code == 200


async def test_root_endpoint(client):
    response = await client.get("/")
    assert response.status_code == 200


async def test_database_is_usable(db):
    from sqlalchemy import text

    result = await db.execute(text("SELECT 1"))
    assert result.scalar_one() == 1
