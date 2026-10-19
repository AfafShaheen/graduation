"""Upload tests for university records: GPA, major validation, normalization, and upsert rules."""

from io import BytesIO
from openpyxl import Workbook
from decimal import Decimal
from sqlalchemy import select
from app.models.major import MajorModel
from app.models.university_record import UniversityRecordModel


def _make_xlsx(rows, headers=None):
    wb = Workbook()
    ws = wb.active
    if headers is None:
        headers = ["university_id", "full_name", "father_name", "mother_name", "college", "gender", "gpa", "major"]
    ws.append(headers)
    for r in rows:
        ws.append(list(r))
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def _admin_token(client, make_admin):
    admin = await make_admin()
    resp = await client.post("/api/admin/auth/login", json={"username": admin.username, "password": "AdminPass123!"})
    return resp.json()["access_token"]


async def test_upload_missing_gpa_column_reports_error(client, db, make_event, make_college, make_admin):
    event = await make_event()
    college = await make_college(event.id, name="كلية العلوم")
    token = await _admin_token(client, make_admin)

    file_content = _make_xlsx([("300001", "أحمد", "أ", "ب", "كلية العلوم", "ذكر")], headers=["university_id", "full_name", "father_name", "mother_name", "college", "gender"])
    resp = await client.post(
        f"/api/admin/events/{event.id}/university-records",
        files={"file": ("rec.xlsx", file_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert any("gpa" in err or "المعدل" in err for err in resp.json()["errors"])


async def test_upload_arabic_digits_and_comma_gpa(client, db, make_event, make_college, make_admin, make_major):
    event = await make_event()
    college = await make_college(event.id, name="كلية العلوم")
    major = await make_major(college.id, name="فيزياء")
    token = await _admin_token(client, make_admin)

    # Arabic-Indic digits ٨٥,٥٠ (85.50) with comma or ٫
    file_content = _make_xlsx([("300002", "محمد", "أ", "ب", "كلية العلوم", "ذكر", "٨٥,٥٠", "فيزياء")])
    resp = await client.post(
        f"/api/admin/events/{event.id}/university-records",
        files={"file": ("rec.xlsx", file_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["errors"] == []
    assert resp.json()["added"] == 1

    rec = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "300002"))).scalar_one()
    assert rec.gpa == Decimal("85.50")
    assert rec.major_id == major.id


async def test_upload_unknown_major_reports_error_and_never_inserts_major(client, db, make_event, make_college, make_admin):
    event = await make_event()
    college = await make_college(event.id, name="كلية العلوم")
    token = await _admin_token(client, make_admin)

    file_content = _make_xlsx([("300003", "سامر", "أ", "ب", "كلية العلوم", "ذكر", "90.00", "تخصص وهمي")])
    resp = await client.post(
        f"/api/admin/events/{event.id}/university-records",
        files={"file": ("rec.xlsx", file_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert len(resp.json()["errors"]) > 0

    majors = (await db.execute(select(MajorModel))).scalars().all()
    assert len(majors) == 0


async def test_upload_major_under_different_college_reports_error(client, db, make_event, make_college, make_admin, make_major):
    event = await make_event()
    college1 = await make_college(event.id, name="كلية 1")
    college2 = await make_college(event.id, name="كلية 2")
    make_major(college2.id, name="حاسبات")
    token = await _admin_token(client, make_admin)

    file_content = _make_xlsx([("300004", "رامي", "أ", "ب", "كلية 1", "ذكر", "90.00", "حاسبات")])
    resp = await client.post(
        f"/api/admin/events/{event.id}/university-records",
        files={"file": ("rec.xlsx", file_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert any("غير موجود" in err for err in resp.json()["errors"])


async def test_upload_normalization_matches_hamza_and_taamarbuta(client, db, make_event, make_college, make_admin, make_major):
    event = await make_event()
    college = await make_college(event.id, name="كلية الآداب")
    major = await make_major(college.id, name="تربية إسلامية")
    token = await _admin_token(client, make_admin)

    file_content = _make_xlsx([("300005", "هيثم", "أ", "ب", "كلية الآداب", "ذكر", "88.00", "تربيه اسلاميه")])
    resp = await client.post(
        f"/api/admin/events/{event.id}/university-records",
        files={"file": ("rec.xlsx", file_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["errors"] == []
    rec = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "300005"))).scalar_one()
    assert rec.major_id == major.id


async def test_upload_numeric_university_id_cell_drops_trailing_decimal(
    client, db, make_event, make_college, make_admin
):
    """Excel numeric ids must not be stored as 12345678.0 (they would never match typed input)."""
    event = await make_event()
    await make_college(event.id, name="كلية العلوم")
    token = await _admin_token(client, make_admin)

    file_content = _make_xlsx(
        [
            (310001, "سامر", "أ", "ب", "كلية العلوم", "ذكر", 85),
            (310002.0, "ليلى", "ج", "د", "كلية العلوم", "أنثى", 78.5),
        ],
        headers=["university_id", "full_name", "father_name", "mother_name", "college", "gender", "gpa"],
    )
    resp = await client.post(
        f"/api/admin/events/{event.id}/university-records",
        files={"file": ("rec.xlsx", file_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["errors"] == []
    assert resp.json()["added"] == 2

    ids = (
        await db.execute(select(UniversityRecordModel.university_id).order_by(UniversityRecordModel.university_id))
    ).scalars().all()
    assert list(ids) == ["310001", "310002"]
