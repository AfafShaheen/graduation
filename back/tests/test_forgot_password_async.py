"""Item 2.5-8: forgot-password must not reveal registration status.

The endpoint returns the same generic success for every email and performs the
graduate lookup plus OTP issuance in a detached background task, so neither the
response body nor the response time depends on whether the email exists.
"""

import asyncio
import time

from app.services import auth_service


def _email(local: str) -> str:
    return local + "@" + "example.com"


async def test_forgot_password_returns_before_slow_sender(
    client, make_event, make_college, make_graduate, monkeypatch
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(
        college.id, university_id="600001", email=_email("slow")
    )

    finished = {"done": False}

    def _slow_send(*args, **kwargs):
        time.sleep(0.5)
        finished["done"] = True
        return True

    monkeypatch.setattr(auth_service, "send_otp_email", _slow_send)

    start = time.perf_counter()
    resp = await client.post("/api/auth/forgot-password", json={"email": grad.email})
    elapsed = time.perf_counter() - start

    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert elapsed < 0.5
    assert finished["done"] is False

    for _ in range(100):
        if finished["done"]:
            break
        await asyncio.sleep(0.05)

    assert finished["done"] is True


async def test_forgot_password_registered_and_unknown_identical(
    client, make_event, make_college, make_graduate, sent_otps
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(
        college.id, university_id="600002", email=_email("registered")
    )

    unknown = await client.post(
        "/api/auth/forgot-password", json={"email": _email("nobody")}
    )
    known = await client.post(
        "/api/auth/forgot-password", json={"email": grad.email}
    )

    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()

    await asyncio.sleep(0.1)
