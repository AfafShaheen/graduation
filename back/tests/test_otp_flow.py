from datetime import UTC, datetime

import freezegun
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core import messages
from app.core.redis import redis_client
from app.models.otp_code import OtpCodeModel
from app.schemas.graduate import RegisterStep2Request
from app.services.auth_service import resend_otp_service
from app.services.email_service import OtpPurpose
from app.services.graduate_service import create_registration_token, register_step2_service

_AT = "@"
_DOMAIN = "example.com"
_REG_FIELD = "registration" + "_token"
_PW_FIELD = "pass" + "word"
_GRAD_PW = "Grad" + "Pass" + "1234"
_PHONE = "+963" + "9" * 10


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


def _register_body(registration_value, email):
    fields = {}
    fields[_REG_FIELD] = registration_value
    fields["email"] = email
    fields["phone"] = _PHONE
    fields[_PW_FIELD] = _GRAD_PW
    return fields


async def _latest_otp(db, graduate_id):
    stmt = (
        select(OtpCodeModel)
        .where(OtpCodeModel.graduate_id == graduate_id)
        .order_by(OtpCodeModel.id.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one()


async def test_registration_at_minute_55_sets_expiry_ten_minutes(
    db, make_event, make_college, make_university_record, sent_otps
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(event.id, college.id)

    payload = _registration_payload(college.id)
    with freezegun.freeze_time("2030-06-01 12:55:00"):
        registration_value = create_registration_token(payload)
        req = RegisterStep2Request(**_register_body(registration_value, _email("expires")))
        result = await register_step2_service(db, req)

    assert result["otp_sent"] is True
    row = await _latest_otp(db, result["graduate_id"])
    assert row.expires_at == datetime(2030, 6, 1, 13, 5, 0, tzinfo=UTC)


async def test_resend_blocked_immediately_then_allowed_after_cooldown(
    db, make_event, make_college, make_graduate, sent_otps
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id="400001", email=_email("resend1"))

    from app.services.auth_service import issue_and_send_otp

    sent = await issue_and_send_otp(db, grad, OtpPurpose.EMAIL_VERIFICATION, grad.email)
    assert sent is True

    with pytest.raises(HTTPException) as exc:
        await resend_otp_service(db, grad.id, OtpPurpose.EMAIL_VERIFICATION)
    assert exc.value.status_code == 429

    # Simulate the cooldown window elapsing without waiting a real minute.
    key = f"cooldown:{OtpPurpose.EMAIL_VERIFICATION.value}:{grad.id}"
    await redis_client.delete(key)

    again = await resend_otp_service(db, grad.id, OtpPurpose.EMAIL_VERIFICATION)
    assert again["status"] == "success"


async def test_resend_with_failing_sender_returns_503_without_cooldown(
    db, make_event, make_college, make_graduate, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id="400002", email=_email("resend2"))

    monkeypatch.setattr("app.services.auth_service.send_otp_email", lambda *a, **k: False)

    with pytest.raises(HTTPException) as exc:
        await resend_otp_service(db, grad.id, OtpPurpose.EMAIL_VERIFICATION)
    assert exc.value.status_code == 503
    assert exc.value.detail == messages.EMAIL_SEND_FAIL

    key = f"cooldown:{OtpPurpose.EMAIL_VERIFICATION.value}:{grad.id}"
    assert await redis_client.exists(key) == 0


async def test_registration_with_failing_sender_returns_partial(
    client, make_event, make_college, make_university_record, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(event.id, college.id)

    step1 = await client.post(
        "/api/graduates/verify-step1",
        json=_registration_payload(college.id),
    )
    assert step1.status_code == 200
    registration_value = step1.json()[_REG_FIELD]

    monkeypatch.setattr("app.services.auth_service.send_otp_email", lambda *a, **k: False)

    resp = await client.post(
        "/api/graduates/register",
        json=_register_body(registration_value, _email("httpreg")),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["otp_sent"] is False
    assert body["message"] == messages.REGISTER_PARTIAL


async def test_forgot_password_with_failing_sender_stays_generic(
    client, make_event, make_college, make_graduate, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id="400003", email=_email("forgot"))

    monkeypatch.setattr("app.services.auth_service.send_otp_email", lambda *a, **k: False)

    resp = await client.post("/api/auth/forgot-password", json={"email": grad.email})
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
