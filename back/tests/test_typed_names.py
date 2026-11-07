"""Names: matched loosely against the Affairs file, stored exactly as the graduate typed them."""

import pytest
from sqlalchemy import select

from app.core.names import clean_typed_name, name_key, normalize_arabic
from app.models.audit_log import AuditLogModel
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from tests.test_upload_to_login_flow import (  # noqa: F401  (setup is a fixture)
    _GRAD_PW,
    _PHONE,
    _PW_FIELD,
    _admin_headers,
    _me,
    _register_and_login,
    _row,
    _upload,
    _verify_body,
    _xlsx,
    setup,
)


# ------------------------------------------------------------------ the rules themselves
def test_spellings_that_are_the_same_name():
    same = [
        ("أحمد", "احمد"), ("إبراهيم", "ابراهيم"), ("آدم", "ادم"),
        ("فاطمة", "فاطمه"), ("موسى", "موسي"),
        ("عبد الله", "عبدالله"), ("عبد الرحمن", "عبدالرحمن"),
        ("محـمد", "محمد"),                  # tatweel
        ("مُحَمَّد", "محمد"),                # diacritics
        ("کریم", "كريم"),                    # Persian keheh and yeh
        ("  محمد   علي ", "محمد علي"),       # spaces
        ("محمد‏", "محمد"),               # invisible mark from copy and paste
    ]
    for a, b in same:
        assert name_key(a) == name_key(b), (a, b)


def test_names_that_stay_different():
    different = [("فاطمة", "فاطنة"), ("محمد", "محمود"), ("علي", "على١"), ("رائد", "رايد"), ("مؤمن", "مومن")]
    for a, b in different:
        assert name_key(a) != name_key(b), (a, b)


def test_cleaning_keeps_the_spelling_the_graduate_typed():
    assert clean_typed_name("  فاطمة   الزهراء ") == "فاطمة الزهراء"
    assert clean_typed_name("أَحْمَد") == "أحمد"        # diacritics go, the hamza stays
    assert clean_typed_name("محـمد") == "محمد"           # tatweel goes
    assert clean_typed_name("عبد‏الله") == "عبدالله"  # invisible marks go
    assert clean_typed_name(None) == "" and clean_typed_name("") == ""
    assert normalize_arabic("أحمد") == "احمد"            # matching still unifies


# ------------------------------------------------------------------ registration keeps what was typed
async def test_the_account_keeps_the_names_as_typed(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(
        client, headers, event.id,
        _xlsx([_row("920001", first="فاطمه", last="احمد", father="عبد الله", mother="خديجه")]),
    )
    login = await _register_and_login(
        client, sent_otps, college.id, "920001", "typed@example.com",
        first="فاطمة", last="أحمد", father="عبدالله", mother="خديجة",
    )
    graduate = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == "920001"))).scalar_one()
    assert (graduate.first_name, graduate.last_name) == ("فاطمة", "أحمد")
    assert graduate.full_name == "فاطمة أحمد"
    assert graduate.father_name == "عبدالله" and graduate.mother_name == "خديجة"
    assert (await _me(client, login))["full_name"] == "فاطمة أحمد"
    # the file's record is left as it was
    record = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "920001"))).scalar_one()
    assert record.father_name == "عبد الله"


async def test_the_other_way_round_the_file_has_the_hamza(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("920002", first="أحمد", last="إبراهيم")]))
    await _register_and_login(
        client, sent_otps, college.id, "920002", "other@example.com", first="احمد", last="ابراهيم",
    )
    graduate = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == "920002"))).scalar_one()
    assert graduate.full_name == "احمد ابراهيم"


async def test_diacritics_and_extra_spaces_are_removed_from_what_is_stored(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("920003")]))
    await _register_and_login(
        client, sent_otps, college.id, "920003", "clean@example.com", first="مُحَمَّد", last="  أحمد ",
    )
    graduate = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == "920003"))).scalar_one()
    assert (graduate.first_name, graduate.last_name) == ("محمد", "أحمد")


async def test_a_name_that_is_really_different_is_still_refused(client, setup):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("920004", first="فاطمة")]))
    wrong = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "920004", first="فاطنة"))
    assert wrong.status_code == 400


async def test_a_registration_token_from_before_this_rule_still_works(client, db, setup, sent_otps):
    from app.services.graduate_service import create_registration_token

    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("920005")]))
    record = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "920005"))).scalar_one()
    old_token = create_registration_token(
        {"university_record_id": record.id, "university_id": "920005", "college_id": college.id, "gpa": "80.00", "top_rank": None}
    )
    reg = await client.post(
        "/api/graduates/register",
        json={"registration_token": old_token, "email": "old@example.com", "phone": _PHONE, _PW_FIELD: _GRAD_PW},
    )
    assert reg.status_code == 201, reg.text
    graduate = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == "920005"))).scalar_one()
    assert graduate.first_name == record.first_name  # no typed names in that token: the file's


# ------------------------------------------------------------------ the exceptional action
async def _registered(client, db, setup, sent_otps, uni_id, email):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row(uni_id)]))
    login = await _register_and_login(client, sent_otps, college.id, uni_id, email)
    graduate = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == uni_id))).scalar_one()
    return graduate, login


_NEW = {"first_name": "فاطمة", "last_name": "الأحمد", "father_name": "عبد الله", "mother_name": "خديجة"}


async def test_admin_edits_the_names_and_it_is_logged(client, db, setup, sent_otps):
    event, college, headers = setup
    graduate, login = await _registered(client, db, setup, sent_otps, "920010", "edit@example.com")

    resp = await client.put(f"/api/admin/graduates/{graduate.id}/name", json=_NEW, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["full_name"] == "فاطمة الأحمد"

    await db.refresh(graduate)
    assert (graduate.first_name, graduate.last_name, graduate.father_name, graduate.mother_name) == (
        "فاطمة", "الأحمد", "عبد الله", "خديجة",
    )
    assert (await _me(client, login))["full_name"] == "فاطمة الأحمد"  # the ticket shows it at once

    rows = (await db.execute(select(AuditLogModel).where(AuditLogModel.action == "UPDATE_NAME"))).scalars().all()
    assert len(rows) == 1 and rows[0].graduate_id == graduate.id
    assert "محمد" in rows[0].details and "فاطمة" in rows[0].details, rows[0].details  # old and new


async def test_a_name_edit_is_cleaned_and_validated(client, db, setup, sent_otps):
    event, college, headers = setup
    graduate, _ = await _registered(client, db, setup, sent_otps, "920011", "val@example.com")

    ok = await client.put(
        f"/api/admin/graduates/{graduate.id}/name",
        json={**_NEW, "first_name": "  فَاطِمَة   ", "last_name": "الأحمد"},
        headers=headers,
    )
    assert ok.status_code == 200 and ok.json()["full_name"] == "فاطمة الأحمد", ok.text

    for field, bad in [("first_name", "Fatima"), ("last_name", "أحمد1"), ("father_name", "ع"), ("mother_name", ""), ("first_name", "فاطمة!")]:
        resp = await client.put(f"/api/admin/graduates/{graduate.id}/name", json={**_NEW, field: bad}, headers=headers)
        assert resp.status_code == 422, (field, bad, resp.status_code)

    same = await client.put(f"/api/admin/graduates/{graduate.id}/name", json=_NEW, headers=headers)
    assert same.status_code == 400  # nothing changed this time


async def test_name_edit_needs_an_admin_and_an_existing_graduate(client, db, setup, sent_otps):
    event, college, headers = setup
    graduate, login = await _registered(client, db, setup, sent_otps, "920012", "auth@example.com")
    assert (await client.put(f"/api/admin/graduates/{graduate.id}/name", json=_NEW)).status_code in (401, 403)
    auth = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.put(f"/api/admin/graduates/{graduate.id}/name", json=_NEW, headers=auth)).status_code in (401, 403)
    assert (await client.put("/api/admin/graduates/999999/name", json=_NEW, headers=headers)).status_code == 404


async def test_the_name_edit_is_in_the_exceptional_log(client, db, setup, sent_otps):
    event, college, headers = setup
    graduate, _ = await _registered(client, db, setup, sent_otps, "920013", "log@example.com")
    await client.put(f"/api/admin/graduates/{graduate.id}/name", json=_NEW, headers=headers)
    resp = await client.get("/api/admin/audit-logs", params={"exceptional_only": "true"}, headers=headers)
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert any(i["action"] == "UPDATE_NAME" and i["action_label"] == "تعديل اسم خريج" for i in items)
