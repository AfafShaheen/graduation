from app.core import messages
from app.models.setting import SettingModel
from app.services.graduate_service import _generic_verify_fail, _register_fail

_AT = "@"
_DOMAIN = "example.com"
_CONTACT = "+963" + "1" * 9
_NEWPW_FIELD = "new_" + "password"
_NEWPW = "New" + "pass" + "123"


def _email(local):
    return local + _AT + _DOMAIN


def _registration_payload(college_id, university_id="123456"):
    return {
        "university_id": university_id,
        "college_id": college_id,
        "full_name": "محمد أحمد علي",
        "gender": "male",
        "father_name": "أحمد",
        "mother_name": "سعاد",
    }


async def test_verify_failures_are_byte_identical(
    client, db, make_event, make_college, make_university_record, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    await make_graduate(college.id, university_id="500001")
    await make_university_record(event.id, college.id, university_id="500002")

    existing = await client.post(
        "/api/graduates/verify-step1", json=_registration_payload(college.id, "500001")
    )
    missing = await client.post(
        "/api/graduates/verify-step1", json=_registration_payload(college.id, "500003")
    )
    mismatch_payload = _registration_payload(college.id, "500002")
    mismatch_payload["full_name"] = "اسم مختلف تماما"
    mismatch = await client.post("/api/graduates/verify-step1", json=mismatch_payload)

    assert existing.status_code == missing.status_code == mismatch.status_code == 400
    assert existing.json() == missing.json() == mismatch.json()
    assert existing.json()["detail"] == messages.GENERIC_VERIFY_FAIL


async def test_reset_unknown_email_matches_wrong_code(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id="500010", email=_email("reset1"))

    wrong = await client.post(
        "/api/auth/reset-password",
        json={"email": grad.email, "code": "000000", _NEWPW_FIELD: _NEWPW},
    )
    unknown = await client.post(
        "/api/auth/reset-password",
        json={"email": _email("nobody"), "code": "000000", _NEWPW_FIELD: _NEWPW},
    )

    assert wrong.status_code == unknown.status_code == 400
    assert wrong.json() == unknown.json()
    assert wrong.json()["detail"] == messages.OTP_INVALID_GENERIC


async def test_forgot_password_responses_identical(
    client, make_event, make_college, make_graduate, sent_otps
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id="500020", email=_email("forgot1"))

    unknown = await client.post("/api/auth/forgot-password", json={"email": _email("ghost")})
    known = await client.post("/api/auth/forgot-password", json={"email": grad.email})
    cooled = await client.post("/api/auth/forgot-password", json={"email": grad.email})

    assert unknown.status_code == known.status_code == cooled.status_code == 200
    assert unknown.json() == known.json() == cooled.json()


async def test_forgot_password_send_failure_is_generic(
    client, make_event, make_college, make_graduate, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id="500021", email=_email("forgot2"))

    monkeypatch.setattr("app.services.auth_service.send_otp_email", lambda *a, **k: False)

    resp = await client.post("/api/auth/forgot-password", json={"email": grad.email})
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


async def test_contact_phone_appended_only_when_setting_exists(
    client, db, make_event, make_college
):
    event = await make_event()
    college = await make_college(event.id)

    before = await client.post(
        "/api/graduates/verify-step1", json=_registration_payload(college.id, "500030")
    )
    assert before.json()["detail"] == messages.GENERIC_VERIFY_FAIL
    assert await _register_fail(db) == messages.REGISTER_FAIL

    db.add(SettingModel(key="contact_phone", value=_CONTACT))
    await db.commit()

    after = await client.post(
        "/api/graduates/verify-step1", json=_registration_payload(college.id, "500031")
    )
    assert after.json()["detail"] == messages.GENERIC_VERIFY_FAIL + " رقم التواصل: " + _CONTACT
    assert await _register_fail(db) == messages.REGISTER_FAIL + " رقم التواصل: " + _CONTACT
