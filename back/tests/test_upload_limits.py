"""Upload limits and clean-up for the university data endpoints."""

from io import BytesIO

import pytest
from openpyxl import Workbook


def _xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.append(["university_id", "full_name", "father_name", "mother_name",
               "college", "gender", "gpa", "major"])
    for row in rows:
        ws.append(list(row))
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def _headers(client, make_admin):
    admin = await make_admin()
    resp = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, "password": "AdminPass123!"},
    )
    return {"Authorization": "Bearer " + resp.json()["access_token"]}


@pytest.fixture(autouse=True)
def _storage(tmp_path, monkeypatch):
    import app.services.university_files_service as svc

    monkeypatch.setattr(svc, "STORAGE_DIR", str(tmp_path))
    yield tmp_path


@pytest.fixture
def small_limit(monkeypatch):
    import app.services.university_records_service as records

    monkeypatch.setattr(records, "MAX_UPLOAD_BYTES", 2048)


async def test_files_endpoint_rejects_oversized_upload(
    client, make_admin, small_limit, _storage
):
    headers = await _headers(client, make_admin)
    big = b"a,b\n" + b"1,2\n" * 2000
    resp = await client.post(
        "/api/admin/university-files",
        files={"file": ("big.csv", big, "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 413
    assert list(_storage.iterdir()) == []


async def test_records_endpoint_rejects_oversized_upload(
    client, make_admin, make_event, small_limit
):
    headers = await _headers(client, make_admin)
    event = await make_event()
    big = b"a,b\n" + b"1,2\n" * 2000
    resp = await client.post(
        f"/api/admin/events/{event.id}/university-records",
        files={"file": ("big.csv", big, "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 413


async def test_xls_is_no_longer_accepted(client, make_admin, _storage):
    headers = await _headers(client, make_admin)
    resp = await client.post(
        "/api/admin/university-files",
        files={"file": ("old.xls", b"not really excel", "application/vnd.ms-excel")},
        headers=headers,
    )
    assert resp.status_code == 400
    assert list(_storage.iterdir()) == []


async def test_failed_import_does_not_leave_the_file_on_disk(
    client, make_admin, make_event, _storage
):
    headers = await _headers(client, make_admin)
    event = await make_event()
    # No college is linked to the event, so every row fails validation.
    content = _xlsx([("1001", "طالب أحمد", "أحمد", "سعاد", "كلية غير موجودة", "male", 80, "")])
    resp = await client.post(
        "/api/admin/university-files",
        files={"file": ("rows.xlsx", content,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"event_id": str(event.id)},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"
    assert list(_storage.iterdir()) == []
