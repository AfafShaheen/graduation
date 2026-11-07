"""The chain that matters most: the Affairs file -> verification -> account -> OTP -> login -> ticket.

Each test is one thing that must hold on the ceremony day. The edge cases are the ones a real
file or a real admin can produce: leading zeros, Excel numbers, diacritics, re-uploads after
people registered, a file deleted or moved after people registered, a double click on upload.
"""

import asyncio
from io import BytesIO

import pytest
from openpyxl import Workbook
from sqlalchemy import select

from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_GRAD_PW = "Grad" + "Pass" + "1234"
_PHONE = "+963" + "9" * 10
_COLLEGE = "كلية العلوم"
_HEADERS = [
    "الاسم", "الكنية", "اسم الأب", "اسم الأم", "الجنس",
    "الكلية", "الرقم الجامعي", "المعدل", "حالة الطالب من الأوائل",
]


def _row(uni_id, first="محمد", last="أحمد", father="خالد", mother="سعاد", gender="ذكر", gpa="80.00", college=_COLLEGE):
    return [first, last, father, mother, gender, college, uni_id, gpa, "لا"]


def _xlsx(rows, headers=_HEADERS):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(list(headers))
    for row in rows:
        sheet.append(list(row))
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _csv(rows, headers=_HEADERS, encoding="utf-8-sig", sep=","):
    lines = [sep.join(headers)] + [sep.join(str(c) for c in row) for row in rows]
    return ("\r\n".join(lines) + "\r\n").encode(encoding)


async def _admin_headers(client, make_admin):
    admin = await make_admin()
    resp = await client.post(
        "/api/admin/auth/login", json={"username": admin.username, _PW_FIELD: _ADMIN_PW}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _upload(client, headers, event_id, content, filename="affairs.xlsx"):
    mime = "text/csv" if filename.endswith(".csv") else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return await client.post(
        f"/api/admin/events/{event_id}/university-records",
        files={"file": (filename, content, mime)},
        headers=headers,
    )


async def _upload_file(client, headers, event_id, content, filename="affairs.xlsx"):
    """The "files" screen of the admin: stores the file and imports it."""
    return await client.post(
        "/api/admin/university-files",
        data={"event_id": str(event_id)},
        files={"file": (filename, content, "application/octet-stream")},
        headers=headers,
    )


def _verify_body(college_id, uni_id, first="محمد", last="أحمد", father="خالد", mother="سعاد", gender="ذكر", top_rank=None):
    return {
        "college_id": college_id,
        "university_id": uni_id,
        "first_name": first,
        "last_name": last,
        "father_name": father,
        "mother_name": mother,
        "gender": gender,
        "top_rank": top_rank,
    }


async def _register_and_login(client, sent_otps, college_id, uni_id, email, **names):
    """The whole graduate journey up to a working login. Returns the login response."""
    step1 = await client.post("/api/graduates/verify-step1", json=_verify_body(college_id, uni_id, **names))
    assert step1.status_code == 200, step1.text
    reg = await client.post(
        "/api/graduates/register",
        json={
            "registration_token": step1.json()["registration_token"],
            "email": email,
            "phone": _PHONE,
            _PW_FIELD: _GRAD_PW,
        },
    )
    assert reg.status_code == 201, reg.text
    verify = await client.post(
        "/api/auth/verify-otp",
        headers={"Authorization": f"Bearer {reg.json()['verification_token']}"},
        json={"code": sent_otps[-1][1]},
    )
    assert verify.status_code == 200, verify.text
    login = await client.post("/api/auth/graduate/login", json={"email": email, _PW_FIELD: _GRAD_PW})
    assert login.status_code == 200, login.text
    return login


async def _me(client, login):
    resp = await client.get(
        "/api/graduates/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture
async def setup(client, make_event, make_college, make_admin):
    event = await make_event()
    college = await make_college(event.id, name=_COLLEGE)
    headers = await _admin_headers(client, make_admin)
    return event, college, headers


# ------------------------------------------------------------------ the whole road
async def test_whole_road_from_file_to_login(client, db, setup, sent_otps):
    event, college, headers = setup
    up = await _upload(client, headers, event.id, _xlsx([_row("900001")]))
    assert up.status_code == 200 and up.json()["errors"] == [], up.text

    login = await _register_and_login(client, sent_otps, college.id, "900001", "road@example.com")
    me = await _me(client, login)
    assert me["university_id"] == "900001"
    assert me["full_name"] == "محمد احمد"
    assert me["college_name"] == _COLLEGE


async def test_the_same_file_through_the_files_screen_works_the_same(client, setup, sent_otps):
    event, college, headers = setup
    up = await _upload_file(client, headers, event.id, _xlsx([_row("900002")]))
    assert up.status_code == 200 and up.json()["status"] == "imported", up.text
    await _register_and_login(client, sent_otps, college.id, "900002", "files@example.com")


# ------------------------------------------------------------------ what a real file contains
async def test_excel_number_cells_and_text_cells_both_match_the_typed_id(client, setup, sent_otps):
    event, college, headers = setup
    # one id stored as a number, one as text, one number with a decimal point in the sheet
    up = await _upload(client, headers, event.id, _xlsx([_row(900003), _row("900004"), _row(900005.0)]))
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    for uni_id in ("900003", "900004", "900005"):
        resp = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, uni_id))
        assert resp.status_code == 200, (uni_id, resp.text)


async def test_ids_with_leading_zeros_survive_a_csv_file(client, db, setup):
    """A university id such as 0012345 must stay 0012345: the graduate types it with its zeros."""
    event, college, headers = setup
    up = await _upload(client, headers, event.id, _csv([_row("0012345")]), filename="affairs.csv")
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    record = (await db.execute(select(UniversityRecordModel))).scalar_one()
    assert record.university_id == "0012345", record.university_id
    resp = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "0012345"))
    assert resp.status_code == 200, resp.text


async def test_ids_with_leading_zeros_survive_an_excel_text_column(client, db, setup):
    event, college, headers = setup
    up = await _upload(client, headers, event.id, _xlsx([_row("0012346")]))
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    record = (await db.execute(select(UniversityRecordModel))).scalar_one()
    assert record.university_id == "0012346", record.university_id


async def test_csv_saved_by_arabic_windows_excel_is_read(client, setup):
    event, college, headers = setup
    content = _csv([_row("900006", first="سامر", last="عمر")], encoding="cp1256", sep=";")
    up = await _upload(client, headers, event.id, content, filename="affairs.csv")
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    resp = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900006", first="سامر", last="عمر"))
    assert resp.status_code == 200, resp.text


async def test_names_with_diacritics_in_the_file_still_match_what_is_typed(client, setup):
    """Excel names sometimes carry diacritics; the graduate types plain letters."""
    event, college, headers = setup
    up = await _upload(client, headers, event.id, _xlsx([_row("900007", first="مُحَمَّد", last="أَحْمَد")]))
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    resp = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900007"))
    assert resp.status_code == 200, resp.text


async def test_spelling_variants_between_file_and_form_match(client, setup):
    """ة/ه, أ/إ/ا and ى/ي are the same letter to a graduate typing on a phone."""
    event, college, headers = setup
    up = await _upload(
        client, headers, event.id,
        _xlsx([_row("900008", first="إبراهيم", last="موسى", father="عبد الرحمن", mother="فاطمة")]),
    )
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_body(college.id, "900008", first="ابراهيم", last="موسي", father="عبد الرحمن", mother="فاطمه"),
    )
    assert resp.status_code == 200, resp.text


async def test_extra_spaces_around_values_do_not_break_the_match(client, setup):
    event, college, headers = setup
    up = await _upload(client, headers, event.id, _xlsx([_row(" 900009 ", first=" محمد ", last="  أحمد", father="خالد ", mother=" سعاد")]))
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    resp = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900009"))
    assert resp.status_code == 200, resp.text


# ------------------------------------------------------------------ uploads that go wrong
async def test_a_bad_row_rejects_the_whole_file_and_changes_nothing(client, db, setup):
    event, college, headers = setup
    first = await _upload(client, headers, event.id, _xlsx([_row("900010")]))
    assert first.status_code == 200 and first.json()["errors"] == []

    bad = await _upload(client, headers, event.id, _xlsx([_row("900011"), _row("90001x"), _row("900012", gpa="abc")]))
    assert bad.status_code == 200
    assert len(bad.json()["errors"]) == 2
    ids = {r.university_id for r in (await db.execute(select(UniversityRecordModel))).scalars()}
    assert ids == {"900010"}, ids  # the good row of the bad file was not imported, nothing was lost


async def test_wrong_extension_and_empty_file_are_refused_clearly(client, setup):
    event, college, headers = setup
    assert (await _upload(client, headers, event.id, b"x", filename="affairs.txt")).status_code == 400
    assert (await _upload_file(client, headers, event.id, b"", filename="affairs.xlsx")).status_code == 400
    corrupt = await _upload(client, headers, event.id, b"not really an excel file")
    assert corrupt.status_code == 400, corrupt.text


async def test_double_click_on_upload_does_not_crash(client, db, setup):
    """The same new file sent twice at the same moment must end with one record per student, never a 500.
    Repeated: this is a race, so one lucky round proves nothing."""
    event, college, headers = setup
    expected = 0
    for round_number in range(6):
        base = 910000 + round_number * 10
        content = _xlsx([_row(str(base)), _row(str(base + 1)), _row(str(base + 2))])
        results = await asyncio.gather(
            _upload(client, headers, event.id, content),
            _upload(client, headers, event.id, content),
            _upload_file(client, headers, event.id, content, filename="again.xlsx"),
        )
        assert all(r.status_code == 200 for r in results), [r.text[:200] for r in results]
        expected += 3
        count = len((await db.execute(select(UniversityRecordModel))).scalars().all())
        assert count == expected, (round_number, count, expected)



# ------------------------------------------------------------------ people already registered
async def test_reupload_after_registration_keeps_the_graduate_and_his_login(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900015"), _row("900016")]))
    login = await _register_and_login(client, sent_otps, college.id, "900015", "keep@example.com")

    # the Affairs office fixes the file: one student changed, one new
    again = await _upload(client, headers, event.id, _xlsx([_row("900015", mother="منى"), _row("900016"), _row("900017")]))
    assert again.status_code == 200 and again.json()["errors"] == [], again.text
    assert again.json()["skipped_registered"] == 1

    me = await _me(client, login)  # his session still works
    assert me["university_id"] == "900015"
    relogin = await client.post("/api/auth/graduate/login", json={"email": "keep@example.com", _PW_FIELD: _GRAD_PW})
    assert relogin.status_code == 200, relogin.text
    record = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "900015"))).scalar_one()
    assert record.mother_name == "سعاد", "a registered graduate keeps the data he was verified against"


async def test_deleting_a_file_with_its_records_does_not_hurt_registered_graduates(client, db, setup, sent_otps):
    event, college, headers = setup
    up = await _upload_file(client, headers, event.id, _xlsx([_row("900018"), _row("900019")]))
    file_id = up.json()["file"]["id"]
    login = await _register_and_login(client, sent_otps, college.id, "900018", "gone@example.com")

    deleted = await client.delete(f"/api/admin/university-files/{file_id}?delete_records=true", headers=headers)
    assert deleted.status_code == 200, deleted.text

    me = await _me(client, login)  # he can still use the system
    assert me["university_id"] == "900018"
    relogin = await client.post("/api/auth/graduate/login", json={"email": "gone@example.com", _PW_FIELD: _GRAD_PW})
    assert relogin.status_code == 200
    # and his record is still there: the admin roster is built from the records
    still = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "900018"))).scalar_one_or_none()
    assert still is not None, "deleting a file removed the record of a graduate who already registered"
    gone = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "900019"))).scalar_one_or_none()
    assert gone is None, "the students who did not register are removed with the file"


async def test_moving_a_file_to_another_event_does_not_remove_registered_graduates_records(client, db, setup, sent_otps, make_event, make_college):
    event, college, headers = setup
    up = await _upload_file(client, headers, event.id, _xlsx([_row("900020")]))
    file_id = up.json()["file"]["id"]
    await _register_and_login(client, sent_otps, college.id, "900020", "moved@example.com")

    other = await make_event(name="حفل آخر")
    await make_college(other.id, name=_COLLEGE + " 2")
    moved = await client.post(f"/api/admin/university-files/{file_id}/link", json={"event_id": other.id}, headers=headers)
    # the file's college names do not exist in the other event, so the import is refused: nothing may be lost
    assert moved.status_code == 200, moved.text
    rec = (await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.university_id == "900020"))).scalar_one_or_none()
    assert rec is not None, "a registered graduate lost his record because the file was moved"


async def test_a_graduate_in_the_middle_of_registration_when_the_file_changes(client, db, setup, sent_otps):
    """Step 1 done, then the admin re-uploads: step 2 must still work (or ask to restart), never a 500."""
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900021")]))
    step1 = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900021"))
    assert step1.status_code == 200

    await _upload(client, headers, event.id, _xlsx([_row("900021", gpa="91.00")]))
    reg = await client.post(
        "/api/graduates/register",
        json={"registration_token": step1.json()["registration_token"], "email": "mid@example.com", "phone": _PHONE, _PW_FIELD: _GRAD_PW},
    )
    assert reg.status_code in (201, 401), reg.text


async def test_record_deleted_between_step_one_and_two_asks_to_restart(client, db, setup, sent_otps):
    event, college, headers = setup
    up = await _upload_file(client, headers, event.id, _xlsx([_row("900022")]))
    step1 = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900022"))
    assert step1.status_code == 200
    await client.delete(f"/api/admin/university-files/{up.json()['file']['id']}?delete_records=true", headers=headers)
    reg = await client.post(
        "/api/graduates/register",
        json={"registration_token": step1.json()["registration_token"], "email": "del@example.com", "phone": _PHONE, _PW_FIELD: _GRAD_PW},
    )
    assert reg.status_code == 401, reg.text


# ------------------------------------------------------------------ verification must stay strict
async def test_wrong_details_never_pass_and_the_message_does_not_leak(client, setup):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900023")]))
    wrong = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900023", mother="غير صحيح"))
    unknown = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "999999"))
    assert wrong.status_code == 400 and unknown.status_code == 400
    assert wrong.json()["detail"] == unknown.json()["detail"], "the answer must not reveal whether the id exists"


async def test_the_same_student_cannot_register_twice(client, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900024")]))
    await _register_and_login(client, sent_otps, college.id, "900024", "first@example.com")
    again = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900024"))
    assert again.status_code == 400, again.text


async def test_a_student_of_another_college_cannot_use_a_record_of_this_one(client, setup, make_college):
    event, college, headers = setup
    other_college = await make_college(event.id, name="كلية الحقوق")
    await _upload(client, headers, event.id, _xlsx([_row("900025")]))
    resp = await client.post("/api/graduates/verify-step1", json=_verify_body(other_college.id, "900025"))
    assert resp.status_code == 400, resp.text


async def test_unverified_email_blocks_login_but_lets_him_resume(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900026")]))
    step1 = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900026"))
    reg = await client.post(
        "/api/graduates/register",
        json={"registration_token": step1.json()["registration_token"], "email": "pend@example.com", "phone": _PHONE, _PW_FIELD: _GRAD_PW},
    )
    assert reg.status_code == 201
    login = await client.post("/api/auth/graduate/login", json={"email": "pend@example.com", _PW_FIELD: _GRAD_PW})
    assert login.status_code == 403
    assert login.json()["detail"]["verification_token"]
    # a new upload does not wipe or duplicate his pending account
    again = await _upload(client, headers, event.id, _xlsx([_row("900026")]))
    assert again.status_code == 200 and again.json()["skipped_registered"] == 1
    graduates = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == "900026"))).scalars().all()
    assert len(graduates) == 1


async def test_two_colleges_moved_between_events_leave_no_duplicate_records_that_break_verification(
    client, db, make_event, make_college, make_admin
):
    """An admin moves a college from one ceremony to another and uploads the file again.
    The student must still be able to verify (no 500 from two matching records)."""
    event_a = await make_event(name="حفل أ")
    college = await make_college(event_a.id, name=_COLLEGE)
    headers = await _admin_headers(client, make_admin)
    await _upload(client, headers, event_a.id, _xlsx([_row("900027")]))

    event_b = await make_event(name="حفل ب")
    # move the college: unlink from A, link to B (what the admin's edit screen does)
    unlink = await client.put(
        f"/api/admin/events/{event_a.id}", json={"college_names": ["كلية ثانية"]}, headers=headers
    )
    assert unlink.status_code == 200, unlink.text
    link = await client.put(
        f"/api/admin/events/{event_b.id}", json={"college_names": [_COLLEGE]}, headers=headers
    )
    assert link.status_code == 200, link.text
    await _upload(client, headers, event_b.id, _xlsx([_row("900027")]))

    resp = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900027"))
    assert resp.status_code == 200, resp.text


# ------------------------------------------------------------------ login
async def test_login_is_case_and_space_insensitive_on_the_email_and_never_reveals_which_part_is_wrong(client, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900028")]))
    await _register_and_login(client, sent_otps, college.id, "900028", "mixed@example.com")
    ok = await client.post("/api/auth/graduate/login", json={"email": "  Mixed@Example.com ", _PW_FIELD: _GRAD_PW})
    assert ok.status_code == 200, ok.text
    bad_pw = await client.post("/api/auth/graduate/login", json={"email": "mixed@example.com", _PW_FIELD: "WrongPass1234"})
    bad_mail = await client.post("/api/auth/graduate/login", json={"email": "nobody@example.com", _PW_FIELD: _GRAD_PW})
    assert bad_pw.status_code == bad_mail.status_code == 401
    assert bad_pw.json()["detail"] == bad_mail.json()["detail"]


async def test_the_graduate_row_holds_what_the_file_said(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900029", gpa="93.50")]))
    await _register_and_login(client, sent_otps, college.id, "900029", "row@example.com")
    graduate = (await db.execute(select(GraduateModel).where(GraduateModel.university_id == "900029"))).scalar_one()
    assert graduate.college_id == college.id
    assert str(graduate.gpa) == "93.50"
    assert graduate.email_verified is True
    assert graduate.top_rank is None


# ------------------------------------------------------------------ messy but real files
async def test_blank_rows_in_the_sheet_are_ignored(client, db, setup):
    """Excel often keeps empty formatted rows in the middle or at the end of a sheet."""
    event, college, headers = setup
    blank = [None] * len(_HEADERS)
    content = _xlsx([_row("900030"), blank, _row("900031"), blank, blank])
    up = await _upload(client, headers, event.id, content)
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    ids = {r.university_id for r in (await db.execute(select(UniversityRecordModel))).scalars()}
    assert ids == {"900030", "900031"}


async def test_university_ids_written_with_arabic_digits_are_accepted(client, db, setup):
    """An id typed on an Arabic keyboard in the Affairs office: the graduate types it with 0-9."""
    event, college, headers = setup
    up = await _upload(client, headers, event.id, _xlsx([_row("٩٠٠٠٣٢")]))
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    record = (await db.execute(select(UniversityRecordModel))).scalar_one()
    assert record.university_id == "900032", record.university_id


async def test_a_file_with_an_extra_unknown_column_says_which_column(client, setup):
    event, college, headers = setup
    content = _xlsx([_row("900033") + ["ملاحظة"]], headers=_HEADERS + ["ملاحظات"])
    up = await _upload(client, headers, event.id, content)
    assert up.status_code == 400
    assert "ملاحظات" in up.json()["detail"]


async def test_gpa_in_all_the_usual_shapes(client, db, setup):
    event, college, headers = setup
    rows = [_row("900034", gpa="85"), _row("900035", gpa="٨٥٫٥"), _row("900036", gpa="72.72%"), _row("900037", gpa=0.7272)]
    up = await _upload(client, headers, event.id, _xlsx(rows))
    assert up.status_code == 200 and up.json()["errors"] == [], up.text
    got = {r.university_id: str(r.gpa) for r in (await db.execute(select(UniversityRecordModel))).scalars()}
    assert got["900034"].startswith("85")
    assert got["900035"].startswith("85.5")
    assert got["900036"].startswith("72.72")
    assert got["900037"].startswith("72.72")


async def test_someone_guessing_an_id_is_stopped_but_the_real_student_is_not(client, setup):
    """The limit is per address: a stranger's wrong attempts must not lock the real student out."""
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900038")]))
    stranger = {"X-Forwarded-For": "10.0.0.1"}
    student = {"X-Forwarded-For": "10.0.0.2"}
    for _ in range(10):
        wrong = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900038", mother="خطأ"), headers=stranger)
        assert wrong.status_code == 400
    blocked = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900038", mother="خطأ"), headers=stranger)
    assert blocked.status_code == 429
    real = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "900038"), headers=student)
    assert real.status_code == 200, (real.status_code, real.text)


async def test_many_addresses_together_are_still_stopped(client, setup):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900039")]))
    statuses = []
    for n in range(62):
        resp = await client.post(
            "/api/graduates/verify-step1",
            json=_verify_body(college.id, "900039", mother="خطأ"),
            headers={"X-Forwarded-For": f"10.1.{n // 250}.{n % 250 + 1}"},
        )
        statuses.append(resp.status_code)
    assert statuses[:60] == [400] * 60
    assert 429 in statuses[60:]


async def test_arabic_digits_typed_by_the_graduate_are_the_same_id(client, setup):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900040")]))
    resp = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, "٩٠٠٠٤٠"))
    assert resp.status_code == 200, resp.text


async def test_phone_numbers_in_the_file_with_arabic_digits_are_kept():
    from app.services.university_records_service import normalize_phone
    assert normalize_phone("٠٩٩١٢٣٤٥٦٧") == "0991234567"
    assert normalize_phone("+٩٦٣٩٩١٢٣٤٥٦٧") == "+963991234567"
    assert normalize_phone("0991234567") == "0991234567"
    assert normalize_phone(None) is None


# ------------------------------------------------------------------ the session after login
async def test_refresh_then_logout_ends_the_session_for_good(client, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900041")]))
    login = await _register_and_login(client, sent_otps, college.id, "900041", "sess@example.com")
    tokens = login.json()

    refreshed = await client.post("/api/auth/graduate/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200, refreshed.text
    new = refreshed.json()
    assert (await client.get("/api/graduates/me", headers={"Authorization": f"Bearer {new['access_token']}"})).status_code == 200

    # the old refresh token was used once: using it again is refused (and kills the family)
    replay = await client.post("/api/auth/graduate/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401

    # after that, even the newest refresh token is dead
    again = await client.post("/api/auth/graduate/refresh", json={"refresh_token": new["refresh_token"]})
    assert again.status_code == 401


async def test_logout_blocks_the_access_token_at_once(client, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900042")]))
    login = await _register_and_login(client, sent_otps, college.id, "900042", "bye@example.com")
    tokens = login.json()
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    out = await client.post("/api/auth/graduate/logout", headers=auth, json={"refresh_token": tokens["refresh_token"]})
    assert out.status_code == 200, out.text
    assert (await client.get("/api/graduates/me", headers=auth)).status_code == 401
    assert (await client.post("/api/auth/graduate/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401


async def test_a_graduate_token_cannot_open_admin_or_scanner_doors(client, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("900043")]))
    login = await _register_and_login(client, sent_otps, college.id, "900043", "door@example.com")
    auth = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/api/admin/university-files", headers=auth)).status_code in (401, 403)
    assert (await client.post(f"/api/admin/events/{event.id}/university-records", headers=auth,
                              files={"file": ("a.xlsx", _xlsx([_row("900044")]), "application/octet-stream")})).status_code in (401, 403)
    assert (await client.post("/api/scanner/scan", headers=auth, json={"code": "KM1234567"})).status_code in (401, 403)


async def test_nobody_without_a_token_can_upload_or_list_files(client, setup):
    event, college, headers = setup
    assert (await client.get("/api/admin/university-files")).status_code in (401, 403)
    assert (await client.post(f"/api/admin/events/{event.id}/university-records",
                              files={"file": ("a.xlsx", _xlsx([_row("900045")]), "application/octet-stream")})).status_code in (401, 403)
    assert (await client.delete("/api/admin/university-files/1")).status_code in (401, 403)
