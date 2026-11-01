"""Admin exceptional action: confirm a graduate e-mail without the OTP code.

Covers the whole matrix of task A1.4: the happy path, the guards (already
confirmed -> 400, unknown graduate -> 404, no token -> 401/403), the audit
row and its presence in the exceptional-actions list (with NO e-mail text in
the details), consuming the open OTP rows, the immediate login of the
graduate, the statistics cache invalidation (unverified_accounts drops by
one) and the roster flag ``verify_email``. All data is obviously fake.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core import messages
from app.core.redis import STATS_V2_CACHE_PREFIX, redis_client
from app.models.audit_log import AuditLogModel
from app.models.graduate import GraduateModel
from app.models.otp_code import OtpCodeModel, OtpPurposeEnum
from app.models.ticket import TicketStatusEnum

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_GRAD_PW = "Grad" + "Pass" + "1234"


async def _login(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login", json={"username": admin.username, _PW_FIELD: _ADMIN_PW}
    )
    assert response.status_code == 200, response.text
    return admin, {"Authorization": "Bearer " + response.json()["access_token"]}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
async def _clean_stats_cache():
    async def clear():
        keys = await redis_client.keys(f"{STATS_V2_CACHE_PREFIX}:*")
        if keys:
            await redis_client.delete(*keys)

    await clear()
    yield
    await clear()


async def _seed_person(make_event, make_college, make_university_record, make_graduate):
    """One ceremony, one college, one imported record with an account."""
    event = await make_event(name="حفل تجريبي", seat_prefix="E")
    college = await make_college(event.id, name="كلية الهندسة")
    record = await make_university_record(
        event.id, college.id, university_id="550001", full_name="سامر كريم", gpa=Decimal("80")
    )
    grad = await make_graduate(
        college.id,
        university_id="550001",
        email="fake.samer550001@example.com",
        email_verified=False,
    )
    return event, college, record, grad


async def _add_open_otp(db, graduate_id, *, used=False):
    now = datetime.now(UTC)
    otp = OtpCodeModel(
        graduate_id=graduate_id,
        purpose=OtpPurposeEnum.EMAIL_VERIFICATION.value,
        code_hash="fake-hash-not-a-real-code",
        expires_at=now + timedelta(minutes=10),
        failed_attempts=3,
        used_at=now - timedelta(minutes=1) if used else None,
    )
    db.add(otp)
    await db.commit()
    return otp


# ------------------------------------------------------------------ happy path


async def test_verify_email_confirms_and_returns_the_message(
    client, db, make_admin, make_event, make_college, make_university_record, make_graduate
):
    _admin, h = await _login(client, make_admin)
    _event, _college, _record, grad = await _seed_person(
        make_event, make_college, make_university_record, make_graduate
    )

    resp = await client.post(f"/api/admin/graduates/{grad.id}/verify-email", headers=h)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["message"] == messages.EMAIL_VERIFIED_BY_ADMIN
    assert body["graduate_id"] == grad.id

    db.expunge_all()  # the identity map still holds the pre-request copy
    fresh = (
        await db.execute(select(GraduateModel).where(GraduateModel.id == grad.id))
    ).scalar_one()
    assert fresh.email_verified is True


async def test_already_confirmed_is_refused_with_400(
    client, db, make_admin, make_event, make_college, make_university_record, make_graduate
):
    _admin, h = await _login(client, make_admin)
    _event, _college, _record, grad = await _seed_person(
        make_event, make_college, make_university_record, make_graduate
    )
    first = await client.post(f"/api/admin/graduates/{grad.id}/verify-email", headers=h)
    assert first.status_code == 200, first.text

    second = await client.post(f"/api/admin/graduates/{grad.id}/verify-email", headers=h)

    assert second.status_code == 400
    assert second.json()["detail"] == messages.EMAIL_ALREADY_VERIFIED_BY_ADMIN


async def test_unknown_graduate_is_404(client, make_admin):
    _admin, h = await _login(client, make_admin)

    resp = await client.post("/api/admin/graduates/999999/verify-email", headers=h)

    assert resp.status_code == 404
    assert resp.json()["detail"] == "لم يتم العثور على الخريج."


async def test_requires_admin_token(client, db, make_event, make_college, make_university_record, make_graduate):
    _event, _college, _record, grad = await _seed_person(
        make_event, make_college, make_university_record, make_graduate
    )

    resp = await client.post(f"/api/admin/graduates/{grad.id}/verify-email")

    assert resp.status_code in (401, 403)


# ----------------------------------------------------------------------- audit


async def test_audit_row_without_email_and_in_exceptional_list(
    client, db, make_admin, make_event, make_college, make_university_record, make_graduate
):
    admin, h = await _login(client, make_admin)
    _event, _college, _record, grad = await _seed_person(
        make_event, make_college, make_university_record, make_graduate
    )

    resp = await client.post(f"/api/admin/graduates/{grad.id}/verify-email", headers=h)
    assert resp.status_code == 200, resp.text

    rows = (
        await db.execute(select(AuditLogModel).where(AuditLogModel.action == "VERIFY_EMAIL"))
    ).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.actor_type == "ADMIN"
    assert row.actor_id == admin.id
    assert row.target == f"Graduate ID {grad.id}"
    assert row.graduate_id == grad.id
    # Privacy (S8): the details never contain the address or any part of it.
    assert row.details == "Email confirmed by admin override (no OTP code)."
    for secret in ("@", "fake", "samer", "example"):
        assert secret not in (row.details or "")
        assert secret not in (row.target or "")

    listed = await client.get("/api/admin/audit-logs?exceptional_only=true", headers=h)
    assert listed.status_code == 200, listed.text
    actions = [i["action"] for i in listed.json()["items"]]
    assert "VERIFY_EMAIL" in actions
    labels = [i.get("action_label") for i in listed.json()["items"]]
    assert messages.audit_action_label("VERIFY_EMAIL") == "تأكيد البريد من الأدمن"
    assert "تأكيد البريد من الأدمن" in labels


# ------------------------------------------------------------------- OTP rows


async def test_open_otp_rows_are_consumed(
    client, db, make_admin, make_event, make_college, make_university_record, make_graduate
):
    _admin, h = await _login(client, make_admin)
    _event, _college, _record, grad = await _seed_person(
        make_event, make_college, make_university_record, make_graduate
    )
    await _add_open_otp(db, grad.id)
    await _add_open_otp(db, grad.id)
    await _add_open_otp(db, grad.id, used=True)

    resp = await client.post(f"/api/admin/graduates/{grad.id}/verify-email", headers=h)
    assert resp.status_code == 200, resp.text

    used_rows = (
        await db.execute(
            select(OtpCodeModel.used_at).where(OtpCodeModel.graduate_id == grad.id)
        )
    ).scalars().all()
    assert len(used_rows) == 3
    assert all(row is not None for row in used_rows)


# ---------------------------------------------------------------------- login


async def test_graduate_can_log_in_right_after(client, db, make_admin, make_event, make_college, make_university_record, make_graduate):
    _admin, h = await _login(client, make_admin)
    _event, _college, _record, grad = await _seed_person(
        make_event, make_college, make_university_record, make_graduate
    )
    payload = {"email": grad.email, _PW_FIELD: _GRAD_PW}

    before = await client.post("/api/auth/graduate/login", json=payload)
    assert before.status_code == 403, before.text

    resp = await client.post(f"/api/admin/graduates/{grad.id}/verify-email", headers=h)
    assert resp.status_code == 200, resp.text

    after = await client.post("/api/auth/graduate/login", json=payload)
    assert after.status_code == 200, after.text
    assert after.json()["access_token"]


# ------------------------------------------------------------- stats v2 cache


async def test_stats_unverified_accounts_drops_immediately(
    client, db, make_admin, make_event, make_college, make_university_record, make_graduate
):
    _admin, h = await _login(client, make_admin)
    _event, _college, _record, grad = await _seed_person(
        make_event, make_college, make_university_record, make_graduate
    )
    before = await client.get("/api/admin/stats/v2", headers=h)
    assert before.status_code == 200, before.text
    b = before.json()
    assert b["registered"]["unverified_accounts"] == 1
    assert b["attention"]["processing"] == 0

    resp = await client.post(f"/api/admin/graduates/{grad.id}/verify-email", headers=h)
    assert resp.status_code == 200, resp.text

    after = await client.get("/api/admin/stats/v2", headers=h)
    assert after.status_code == 200, after.text
    a = after.json()
    # The cache was cleared by the action itself: no manual invalidation here.
    assert a["registered"]["unverified_accounts"] == 0


# -------------------------------------------------------------- roster flags


async def test_roster_verify_email_flag(
    client,
    db,
    make_admin,
    make_event,
    make_college,
    make_university_record,
    make_graduate,
    make_ticket,
    make_payment,
):
    _admin, h = await _login(client, make_admin)
    event = await make_event(name="حفل التجريب", seat_prefix="R")
    college = await make_college(event.id, name="كلية الآداب")

    # (a) record + unconfirmed account -> flag true
    await make_university_record(event.id, college.id, university_id="600001", full_name="علي كمال")
    g_a = await make_graduate(college.id, university_id="600001", email_verified=False)
    # (b) record + confirmed account -> flag false
    await make_university_record(event.id, college.id, university_id="600002", full_name="وائل نبيل")
    g_b = await make_graduate(college.id, university_id="600002", email_verified=True)
    # (c) record without any account -> flag false
    await make_university_record(event.id, college.id, university_id="600003", full_name="بشار أسعد")
    # (d) confirmed account WITH a confirmed ticket: the other three flags keep
    #     their existing values while verify_email stays false.
    await make_university_record(event.id, college.id, university_id="600004", full_name="رامي فؤاد")
    g_d = await make_graduate(college.id, university_id="600004", email_verified=True)
    t_d = await make_ticket(g_d.id, event.id, status=TicketStatusEnum.CONFIRMED)
    await make_payment(t_d.id, transaction_number="T600004", amount=100000)

    resp = await client.get(f"/api/admin/roster?event_id={event.id}&limit=100", headers=h)
    assert resp.status_code == 200, resp.text
    items = {i["university_id"]: i for i in resp.json()["items"]}

    assert items["600001"]["actions"]["verify_email"] is True
    assert items["600002"]["actions"]["verify_email"] is False
    assert items["600003"]["actions"]["verify_email"] is False
    assert items["600004"]["actions"]["verify_email"] is False
    # The other three flags are unchanged by this feature.
    assert items["600004"]["actions"]["revert_payment"] is True
    assert items["600004"]["actions"]["manual_entry"] is True
    assert items["600004"]["actions"]["cancel_scan"] is False
    assert items["600003"]["actions"] == {
        "revert_payment": False,
        "manual_entry": False,
        "cancel_scan": False,
        "verify_email": False,
    }

    # After the admin confirms the e-mail the flag flips to false.
    act = await client.post(f"/api/admin/graduates/{g_a.id}/verify-email", headers=h)
    assert act.status_code == 200, act.text
    resp2 = await client.get(f"/api/admin/roster?event_id={event.id}&limit=100", headers=h)
    items2 = {i["university_id"]: i for i in resp2.json()["items"]}
    assert items2["600001"]["actions"]["verify_email"] is False
    assert items2["600001"]["registration"]["state"] == "verified"
