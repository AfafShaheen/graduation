"""Admin college catalog CRUD tests (P5.2).

Covers the four /api/admin/colleges endpoints: listing with majors and linked
events, creation, renaming with normalized duplicate rejection, and deletion
while the college is referenced by an event link, a graduate or a university
record.
"""

from app.core import messages

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _admin_headers(client, make_admin):
    admin = await make_admin()
    resp = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": "Bearer " + resp.json()["access_token"]}


async def test_college_endpoints_require_admin(client):
    resp = await client.get("/api/admin/colleges")
    assert resp.status_code in (401, 403)


async def test_list_colleges_includes_majors_and_linked_events(
    client, make_event, make_college, make_major, make_admin
):
    headers = await _admin_headers(client, make_admin)
    event = await make_event()
    college = await make_college(event.id, name="كلية الهندسة المعلوماتية")
    await make_major(college.id, name="هندسة برمجيات")

    resp = await client.get("/api/admin/colleges", headers=headers)
    assert resp.status_code == 200
    item = next(c for c in resp.json() if c["id"] == college.id)
    assert item["name"] == "كلية الهندسة المعلوماتية"
    assert [m["name"] for m in item["majors"]] == ["هندسة برمجيات"]
    assert [e["id"] for e in item["events"]] == [event.id]


async def test_create_college_and_reject_normalized_duplicate(client, make_admin):
    headers = await _admin_headers(client, make_admin)

    resp = await client.post(
        "/api/admin/colleges", json={"name": "كلية الحقوق"}, headers=headers
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "كلية الحقوق"
    assert body["majors"] == []
    assert body["events"] == []

    dup = await client.post(
        "/api/admin/colleges", json={"name": "  كلية   الحقوق  "}, headers=headers
    )
    assert dup.status_code == 400
    assert dup.json()["detail"] == messages.COLLEGE_NAME_TAKEN


async def test_rename_college_and_conflict(
    client, make_event, make_college, make_admin
):
    headers = await _admin_headers(client, make_admin)
    event = await make_event()
    first = await make_college(event.id, name="كلية أولى")
    second = await make_college(event.id, name="كلية ثانية")

    ok = await client.put(
        f"/api/admin/colleges/{first.id}",
        json={"name": "كلية محدثة"},
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["name"] == "كلية محدثة"

    conflict = await client.put(
        f"/api/admin/colleges/{second.id}",
        json={"name": "كلية محدثة"},
        headers=headers,
    )
    assert conflict.status_code == 400
    assert conflict.json()["detail"] == messages.COLLEGE_NAME_TAKEN

    missing = await client.put(
        "/api/admin/colleges/999999",
        json={"name": "كلية غير موجودة"},
        headers=headers,
    )
    assert missing.status_code == 404
    assert missing.json()["detail"] == messages.COLLEGE_NOT_FOUND


async def test_delete_college_blocked_while_referenced(
    client, make_event, make_college, make_admin, make_graduate, make_university_record
):
    headers = await _admin_headers(client, make_admin)
    event = await make_event()

    linked = await make_college(event.id, name="كلية مرتبطة بحفل")
    blocked = await client.delete(f"/api/admin/colleges/{linked.id}", headers=headers)
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == messages.COLLEGE_LINKED_TO_EVENT

    with_graduate = await make_college(None, name="كلية بخريجين")
    await make_graduate(with_graduate.id, university_id="310001")
    blocked_grad = await client.delete(
        f"/api/admin/colleges/{with_graduate.id}", headers=headers
    )
    assert blocked_grad.status_code == 400
    assert blocked_grad.json()["detail"] == messages.COLLEGE_HAS_GRADUATES

    with_record = await make_college(None, name="كلية بسجلات جامعية")
    await make_university_record(event.id, with_record.id, university_id="310002")
    blocked_record = await client.delete(
        f"/api/admin/colleges/{with_record.id}", headers=headers
    )
    assert blocked_record.status_code == 400
    assert blocked_record.json()["detail"] == messages.COLLEGE_HAS_RECORDS


async def test_delete_college_success_and_missing_404(
    client, make_college, make_admin, make_major
):
    headers = await _admin_headers(client, make_admin)
    college = await make_college(None, name="كلية مؤقتة")
    await make_major(college.id, name="تخصص مؤقت")

    resp = await client.delete(f"/api/admin/colleges/{college.id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert resp.json()["message"] == messages.COLLEGE_DELETED

    listing = await client.get("/api/admin/colleges", headers=headers)
    assert all(c["id"] != college.id for c in listing.json())

    missing = await client.delete(f"/api/admin/colleges/{college.id}", headers=headers)
    assert missing.status_code == 404
    assert missing.json()["detail"] == messages.COLLEGE_NOT_FOUND
