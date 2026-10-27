"""P7.2: admin-only matching diagnostic for Step-1 verification."""

from decimal import Decimal


async def _admin_token(client, make_admin):
    admin = await make_admin()
    resp = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, "password": "AdminPass123!"},
    )
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def test_diagnose_requires_admin(client, db, make_event, make_college, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(event.id, college.id, university_id="700001")

    resp = await client.post(
        "/api/admin/university-records/diagnose",
        json={"university_id": "700001", "college_id": college.id},
    )
    assert resp.status_code in (401, 403)


async def test_diagnose_reports_all_fields_matching(
    client, db, make_event, make_college, make_university_record, make_admin
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(
        event.id,
        college.id,
        university_id="700002",
        full_name="محمد علي",
        father_name="أحمد",
        mother_name="سعاد",
        gender="male",
    )
    token = await _admin_token(client, make_admin)

    resp = await client.post(
        "/api/admin/university-records/diagnose",
        headers=_auth(token),
        json={
            "university_id": "700002",
            "college_id": college.id,
            "first_name": "محمد",
            "last_name": "علي",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "male",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["found"] is True
    assert body["mismatches"] == []
    assert body["record"]["university_id"] == "700002"
    assert all(f["matches"] for f in body["fields"])


async def test_diagnose_flags_mismatched_father_name(
    client, db, make_event, make_college, make_university_record, make_admin
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(
        event.id, college.id, university_id="700003", father_name="أحمد"
    )
    token = await _admin_token(client, make_admin)

    resp = await client.post(
        "/api/admin/university-records/diagnose",
        headers=_auth(token),
        json={
            "university_id": "700003",
            "college_id": college.id,
            "first_name": "محمد",
            "last_name": "علي",
            "father_name": "محمود",
            "mother_name": "سعاد",
            "gender": "male",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["found"] is True
    assert "اسم الأب" in body["mismatches"]
    father = next(f for f in body["fields"] if f["field"] == "father_name")
    assert father["matches"] is False
    assert father["provided"] == "محمود"


async def test_diagnose_normalizes_hamza_and_taa_marbuta(
    client, db, make_event, make_college, make_university_record, make_admin
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(
        event.id, college.id, university_id="700004", father_name="أحمد"
    )
    token = await _admin_token(client, make_admin)

    resp = await client.post(
        "/api/admin/university-records/diagnose",
        headers=_auth(token),
        json={
            "university_id": "700004",
            "college_id": college.id,
            "first_name": "محمد",
            "last_name": "علي",
            "father_name": "احمد",
            "mother_name": "سعاد",
            "gender": "male",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    father = next(f for f in body["fields"] if f["field"] == "father_name")
    assert father["matches"] is True


async def test_diagnose_reports_missing_record(
    client, db, make_event, make_college, make_admin
):
    event = await make_event()
    college = await make_college(event.id)
    token = await _admin_token(client, make_admin)

    resp = await client.post(
        "/api/admin/university-records/diagnose",
        headers=_auth(token),
        json={"university_id": "999999", "college_id": college.id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["found"] is False
    assert body["record"] is None
    assert body["message"]


async def test_diagnose_reports_already_registered(
    client, db, make_event, make_college, make_university_record, make_graduate, make_admin
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(event.id, college.id, university_id="700005")
    await make_graduate(college.id, university_id="700005")
    token = await _admin_token(client, make_admin)

    resp = await client.post(
        "/api/admin/university-records/diagnose",
        headers=_auth(token),
        json={
            "university_id": "700005",
            "college_id": college.id,
            "first_name": "محمد",
            "last_name": "علي",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "male",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["found"] is True
    assert body["already_registered"] is True
