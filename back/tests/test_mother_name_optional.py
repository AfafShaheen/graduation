"""The mother's name is optional in the university file and never needed to register."""

from sqlalchemy import select

from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from tests.test_upload_to_login_flow import (  # noqa: F401  (setup is a fixture)
    _COLLEGE,
    _register_and_login,
    _upload,
    _verify_body,
    _xlsx,
    setup,
)

_HEADERS_NO_MOTHER = ["الاسم", "الكنية", "اسم الأب", "الجنس", "الكلية", "الرقم الجامعي", "المعدل", "حالة الطالب من الأوائل"]


def _row_no_mother(uni_id):
    return ["محمد", "أحمد", "خالد", "ذكر", _COLLEGE, uni_id, "80.00", "لا"]


async def test_a_file_without_the_mother_column_is_accepted(client, db, setup):
    event, college, headers = setup
    up = await _upload(client, headers, event.id, _xlsx([_row_no_mother("930001")], headers=_HEADERS_NO_MOTHER))
    assert up.status_code == 200, up.text
    record = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "930001"))).scalar_one()
    assert record.mother_name is None


async def test_a_blank_mother_cell_is_accepted_and_a_bad_one_is_reported(client, db, setup):
    event, college, headers = setup
    blank = ["محمد", "أحمد", "خالد", "", "ذكر", _COLLEGE, "930002", "80.00", "لا"]
    headers_with = ["الاسم", "الكنية", "اسم الأب", "اسم الأم", "الجنس", "الكلية", "الرقم الجامعي", "المعدل", "حالة الطالب من الأوائل"]
    ok = await _upload(client, headers, event.id, _xlsx([blank], headers=headers_with))
    assert ok.status_code == 200, ok.text

    bad = ["محمد", "أحمد", "خالد", "سعاد123", "ذكر", _COLLEGE, "930003", "80.00", "لا"]
    rejected = await _upload(client, headers, event.id, _xlsx([bad], headers=headers_with))
    body = rejected.json()
    assert body["added"] == 0 and body["errors"][0]["field"] == "اسم الأم", body


async def test_registration_works_for_a_record_without_a_mother_name(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row_no_mother("930004")], headers=_HEADERS_NO_MOTHER))
    body = _verify_body(college.id, "930004")
    body.pop("mother_name", None)
    verify = await client.post("/api/graduates/verify-step1", json=body)
    assert verify.status_code == 200, verify.text
    await _register_and_login(client, sent_otps, college.id, "930004", "nomother@example.com")
    graduate = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == "930004"))).scalar_one()
    assert graduate.mother_name is None
