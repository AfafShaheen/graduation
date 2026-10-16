"""Admin Majors CRUD tests."""

async def _admin_token(client, make_admin):
    admin = await make_admin()
    resp = await client.post("/api/admin/auth/login", json={"username": admin.username, "password": "AdminPass123!"})
    return resp.json()["access_token"]


async def test_majors_crud_permissions(client, make_event, make_college):
    event = await make_event()
    college = await make_college(event.id)

    # 401/403 without token
    resp = await client.get(f"/api/admin/colleges/{college.id}/majors")
    assert resp.status_code in (401, 403)


async def test_majors_create_and_duplicate_rejection(client, make_event, make_college, make_admin):
    event = await make_event()
    college = await make_college(event.id)
    token = await _admin_token(client, make_admin)

    # Create major
    resp = await client.post(
        f"/api/admin/colleges/{college.id}/majors",
        json={"name": "هندسة برمجيات"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    major_id = resp.json()["id"]
    assert isinstance(major_id, int)

    # Normalised duplicate
    resp2 = await client.post(
        f"/api/admin/colleges/{college.id}/majors",
        json={"name": "هندسة  برمجيات "},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp2.status_code == 400


async def test_majors_rename_and_delete_blocking(client, db, make_event, make_college, make_admin, make_major, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    major = await make_major(college.id, name="تخصص قديم")
    token = await _admin_token(client, make_admin)

    # Rename keeps id
    resp = await client.put(
        f"/api/admin/majors/{major.id}",
        json={"name": "تخصص جديد"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == major.id
    assert resp.json()["name"] == "تخصص جديد"

    # Delete blocked when referenced by university record
    await make_university_record(event.id, college.id, university_id="400001", major_id=major.id)

    resp_del = await client.delete(
        f"/api/admin/majors/{major.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp_del.status_code == 400
