"""Public GET /api/registration/colleges tests."""

from datetime import UTC, datetime


async def test_registration_colleges_public_and_nested_majors(client, make_event, make_college, make_major):
    event = await make_event()
    college = await make_college(event.id, name="كلية تقنية")
    major = await make_major(college.id, name="شبكات")

    resp = await client.get("/api/registration/colleges")
    assert resp.status_code == 200
    data = resp.json()
    c_item = next(c for c in data if c["id"] == college.id)
    assert c_item["name"] == "كلية تقنية"
    assert len(c_item["majors"]) == 1
    assert c_item["majors"][0]["id"] == major.id
    assert c_item["majors"][0]["name"] == "شبكات"


async def test_registration_colleges_excludes_expired_events(client, make_event, make_college):
    expired_event = await make_event(
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2021, 1, 1, tzinfo=UTC),
    )
    college = await make_college(expired_event.id, name="كلية منتهية")

    resp = await client.get("/api/registration/colleges")
    assert resp.status_code == 200
    data = resp.json()
    assert not any(c["id"] == college.id for c in data)


async def test_registration_colleges_cache_invalidation_on_new_major(client, make_event, make_college, make_admin):
    event = await make_event()
    college = await make_college(event.id, name="كلية تكنولوجيا")
    token = await _admin_token(client, make_admin)

    resp1 = await client.get("/api/registration/colleges")
    assert resp1.status_code == 200

    await client.post(
        f"/api/admin/colleges/{college.id}/majors",
        json={"name": "أمن سيبراني"},
        headers={"Authorization": f"Bearer {token}"}
    )

    resp2 = await client.get("/api/registration/colleges")
    assert resp2.status_code == 200
    c_item = next(c for c in resp2.json() if c["id"] == college.id)
    assert any(m["name"] == "أمن سيبراني" for m in c_item["majors"])


async def _admin_token(client, make_admin):
    admin = await make_admin()
    resp = await client.post("/api/admin/auth/login", json={"username": admin.username, "password": "AdminPass123!"})
    return resp.json()["access_token"]
