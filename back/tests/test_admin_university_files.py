"""Tests for the central university data-files center (P6.2)."""

from io import BytesIO

import pytest
from openpyxl import Workbook
from sqlalchemy import select

from app.models.university_record import UniversityRecordModel


def _make_xlsx(rows, headers=None):
    wb = Workbook()
    ws = wb.active
    if headers is None:
        headers = [
            "university_id",
            "full_name",
            "father_name",
            "mother_name",
            "college",
            "gender",
            "gpa",
            "major",
        ]
    ws.append(headers)
    for r in rows:
        ws.append(list(r))
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def _admin_token(client, make_admin):
    admin = await make_admin()
    resp = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, "password": "AdminPass123!"},
    )
    return resp.json()["access_token"]


@pytest.fixture(autouse=True)
def _storage(tmp_path, monkeypatch):
    import app.services.university_files_service as svc

    monkeypatch.setattr(svc, "STORAGE_DIR", str(tmp_path))
    yield tmp_path


async def test_upload_file_without_event_then_link_and_import(
    client, db, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name="كلية العلوم")
    token = await _admin_token(client, make_admin)
    headers = {"Authorization": f"Bearer {token}"}

    content = _make_xlsx([("600001", "أحمد", "أ", "ب", "كلية العلوم", "ذكر", "88.00", None)])

    resp = await client.post(
        "/api/admin/university-files",
        files={"file": ("rec.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["file"]["event_id"] is None
    assert body["import"] is None
    file_id = body["file"]["id"]

    linked = await client.post(
        f"/api/admin/university-files/{file_id}/link",
        json={"event_id": event.id},
        headers=headers,
    )
    assert linked.status_code == 200, linked.text
    linked_body = linked.json()
    assert linked_body["file"]["event_id"] == event.id
    assert linked_body["file"]["status"] == "imported"
    assert linked_body["import"]["added"] == 1
    assert linked_body["errors"] == []

    rec = (
        await db.execute(
            select(UniversityRecordModel).where(
                UniversityRecordModel.university_id == "600001"
            )
        )
    ).scalar_one()
    assert rec.event_id == event.id


async def test_upload_file_linked_immediately_aggregates_colleges(
    client, db, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name="كلية العلوم")
    token = await _admin_token(client, make_admin)
    headers = {"Authorization": f"Bearer {token}"}

    content = _make_xlsx(
        [
            ("600010", "سامر", "أ", "ب", "كلية العلوم", "ذكر", "70.00", None),
            ("600011", "ليلى", "ج", "د", "كلية العلوم", "أنثى", "75.00", None),
        ]
    )
    resp = await client.post(
        "/api/admin/university-files",
        files={"file": ("rec.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"event_id": str(event.id)},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["file"]["event_id"] == event.id
    assert body["import"]["added"] == 2
    assert len(body["file"]["colleges"]) == 1
    assert body["file"]["colleges"][0]["rows"] == 2
    assert body["file"]["colleges"][0]["name"] == "كلية العلوم"

    listing = await client.get("/api/admin/university-files", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["event_name"] == event.name


async def test_list_files_empty(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.get(
        "/api/admin/university-files", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"total": 0, "items": []}


async def test_rejects_unsupported_extension(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.post(
        "/api/admin/university-files",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "صيغة" in resp.json()["detail"]


async def test_delete_file_removes_record(client, db, make_event, make_college, make_admin):
    event = await make_event()
    await make_college(event.id, name="كلية العلوم")
    token = await _admin_token(client, make_admin)
    headers = {"Authorization": f"Bearer {token}"}

    content = _make_xlsx([("600020", "ريم", "أ", "ب", "كلية العلوم", "أنثى", "60.00", None)])
    resp = await client.post(
        "/api/admin/university-files",
        files={"file": ("rec.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"event_id": str(event.id)},
        headers=headers,
    )
    file_id = resp.json()["file"]["id"]

    deleted = await client.delete(
        f"/api/admin/university-files/{file_id}", headers=headers
    )
    assert deleted.status_code == 200
    listing = await client.get("/api/admin/university-files", headers=headers)
    assert listing.json()["total"] == 0
