"""Item 2.5-8: forgot-password must not reveal registration status.

The endpoint returns the same generic success for every email and performs the
lookup and OTP issuance inside the request with a guaranteed minimum delay,
so neither the response body nor the response time depends on whether the email exists.
"""

import asyncio
import time

from app.services import auth_service


def _email(local: str) -> str:
    return local + "@" + "example.com"


async def test_forgot_password_waits_for_sender(
    client, make_event, make_college, make_graduate, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(
        college.id, university_id="600001", email=_email("slow")
    )

    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_MIN_SECONDS", 0.3)
    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_SEND_TIMEOUT", 20.0)

    called = {"yes": False}

    def _mock_send(*args, **kwargs):
        time.sleep(0.1)
        called["yes"] = True
        return True

    monkeypatch.setattr(auth_service, "send_otp_email", _mock_send)

    start = time.perf_counter()
    resp = await client.post("/api/auth/forgot-password", json={"email": grad.email})
    elapsed = time.perf_counter() - start

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert called["yes"] is True
    assert elapsed >= (auth_service.FORGOT_PASSWORD_MIN_SECONDS - 0.2)


async def test_forgot_password_unknown_email(
    client, monkeypatch
):
    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_MIN_SECONDS", 0.2)
    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_SEND_TIMEOUT", 20.0)

    start = time.perf_counter()
    resp = await client.post("/api/auth/forgot-password", json={"email": _email("nobody")})
    elapsed = time.perf_counter() - start

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert elapsed >= (auth_service.FORGOT_PASSWORD_MIN_SECONDS - 0.1)


async def test_forgot_password_timeout(
    client, make_event, make_college, make_graduate, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(
        college.id, university_id="600003", email=_email("timeout")
    )

    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_MIN_SECONDS", 0.1)
    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_SEND_TIMEOUT", 0.5)

    def _very_slow_send(*args, **kwargs):
        time.sleep(1.5)
        return True

    monkeypatch.setattr(auth_service, "send_otp_email", _very_slow_send)

    start = time.perf_counter()
    resp = await client.post("/api/auth/forgot-password", json={"email": grad.email})
    elapsed = time.perf_counter() - start

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert elapsed >= 0.1


async def test_forgot_password_registered_and_unknown_identical(
    client, make_event, make_college, make_graduate, sent_otps, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(
        college.id, university_id="600002", email=_email("registered")
    )

    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_MIN_SECONDS", 0.1)
    monkeypatch.setattr(auth_service, "FORGOT_PASSWORD_SEND_TIMEOUT", 20.0)

    unknown = await client.post(
        "/api/auth/forgot-password", json={"email": _email("nobody")}
    )
    known = await client.post(
        "/api/auth/forgot-password", json={"email": grad.email}
    )

    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()


async def test_forgot_password_email_lookup_is_case_insensitive(db, make_event, make_college, make_graduate):
    """A graduate registered as Name@Example.com must be found for name@example.com."""
    from app.services.auth_service import fetch_graduate_by_email

    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id="510099", email="Mixed.Case" + "@" + "Example.com")

    found = await fetch_graduate_by_email(db, "mixed.case" + "@" + "example.com")
    assert found is not None and found.id == grad.id
    found2 = await fetch_graduate_by_email(db, "  MIXED.CASE" + "@" + "EXAMPLE.COM  ")
    assert found2 is not None and found2.id == grad.id
