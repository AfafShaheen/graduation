"""B4: admin graduate list/detail must not use a stale Redis cache."""

from app.core.redis import redis_client

_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _admin_headers(client, make_admin, username="admin_nocache"):
    admin = await make_admin(username=username)
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, "password": _ADMIN_PW},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_admin_graduate_endpoints_do_not_populate_cache(
    client, db, make_admin, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    g = await make_graduate(college.id, university_id="900", email_verified=True)
    headers = await _admin_headers(client, make_admin)

    list_resp = await client.get("/api/admin/graduates", headers=headers)
    assert list_resp.status_code == 200
    detail_resp = await client.get(f"/api/admin/graduates/{g.id}", headers=headers)
    assert detail_resp.status_code == 200

    keys = await redis_client.keys("admin:graduates:*")
    assert keys == []
