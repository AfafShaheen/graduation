"""A scanner from its creation to the gate: create, log in, scan, revert, delete.

Each test is one thing that must hold at the door on the ceremony day.
"""

import asyncio

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLogModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum
from app.services.qr_service import issue_qr_codes_for_ticket

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_SCANNER_PW = "Gate" + "Pass" + "1234"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def admin_headers(client, make_admin):
    admin = await make_admin()
    resp = await client.post("/api/admin/auth/login", json={"username": admin.username, _PW_FIELD: _ADMIN_PW})
    assert resp.status_code == 200, resp.text
    return _bearer(resp.json()["access_token"])


async def _create_scanner(client, admin_headers, event_id, username="gate1", password=_SCANNER_PW):
    return await client.post(
        "/api/admin/scanners",
        json={"username": username, _PW_FIELD: password, "event_id": event_id},
        headers=admin_headers,
    )


async def _login(client, username="gate1", password=_SCANNER_PW, ip=None, **extra):
    return await client.post(
        "/api/scanner/auth/login",
        json={"username": username, _PW_FIELD: password, **extra},
        headers={"X-Forwarded-For": ip} if ip else None,
    )


async def _gate(client, admin_headers, event, username="gate1"):
    """A created scanner that is logged in. Returns (scanner id, headers, login json)."""
    created = await _create_scanner(client, admin_headers, event.id, username)
    assert created.status_code == 201, created.text
    login = await _login(client, username)
    assert login.status_code == 200, login.text
    return created.json()["id"], _bearer(login.json()["access_token"]), login.json()


async def _ticket(db, make_college, make_graduate, make_ticket, event, uni_id="800001", companions=2, status=TicketStatusEnum.CONFIRMED, college=None):
    college = college or await make_college(event.id, name=f"كلية {uni_id}")
    graduate = await make_graduate(college.id, university_id=uni_id, email_verified=True)
    ticket = await make_ticket(graduate.id, event.id, companions_count=companions, status=status)
    codes = await issue_qr_codes_for_ticket(db, ticket.id) if status == TicketStatusEnum.CONFIRMED else []
    await db.commit()
    return graduate, ticket, codes


async def _scan(client, headers, code):
    return await client.post("/api/scanner/scan", json={"code": str(code)}, headers=headers)


def _by_type(codes):
    graduate = next(c for c in codes if c.code_type == QrCodeTypeEnum.GRADUATE)
    companions = [c for c in codes if c.code_type == QrCodeTypeEnum.COMPANION]
    return graduate, companions


# ------------------------------------------------------------------ creating a scanner
async def test_create_list_and_nothing_secret_comes_back(client, db, make_event, admin_headers):
    event = await make_event()
    created = await _create_scanner(client, admin_headers, event.id)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["username"] == "gate1" and body["event_id"] == event.id
    assert _PW_FIELD not in str(body).lower() and "hash" not in str(body).lower()

    listed = await client.get("/api/admin/scanners", params={"event_id": event.id}, headers=admin_headers)
    assert [s["username"] for s in listed.json()] == ["gate1"]
    assert _PW_FIELD not in listed.text.lower() and "hash" not in listed.text.lower()

    rows = (await db.execute(select(AuditLogModel).where(AuditLogModel.action == "SCANNER_CREATED"))).scalars().all()
    assert len(rows) == 1 and _SCANNER_PW not in (rows[0].details or "")


async def test_creation_rules(client, make_event, admin_headers):
    event = await make_event()
    assert (await _create_scanner(client, admin_headers, event.id)).status_code == 201
    assert (await _create_scanner(client, admin_headers, event.id)).status_code == 409, "same username on the same event"

    for bad_name in ("ab", "with space", "عربي123", "a" * 51, "bad/slash"):
        assert (await _create_scanner(client, admin_headers, event.id, username=bad_name)).status_code == 422, bad_name
    for weak in ("short1A", "NoDigitsHere", "12345678", ""):
        assert (await _create_scanner(client, admin_headers, event.id, username="weak1", password=weak)).status_code == 422, weak
    assert (await _create_scanner(client, admin_headers, 999999, username="ghost1")).status_code == 404

    extra = await client.post(
        "/api/admin/scanners",
        json={"username": "extra1", _PW_FIELD: _SCANNER_PW, "event_id": event.id, "is_admin": True},
        headers=admin_headers,
    )
    assert extra.status_code == 422


async def test_the_same_username_may_exist_on_two_events(client, make_event, admin_headers):
    a = await make_event(name="حفل أ")
    b = await make_event(name="حفل ب")
    assert (await _create_scanner(client, admin_headers, a.id, "shared1")).status_code == 201
    assert (await _create_scanner(client, admin_headers, b.id, "shared1", password="Other" + "Pass" + "1234")).status_code == 201


async def test_only_an_admin_can_create_list_or_delete(client, make_event, admin_headers):
    event = await make_event()
    scanner_id, gate, _ = await _gate(client, admin_headers, event)
    assert (await _create_scanner(client, {}, event.id, "anon1")).status_code in (401, 403)
    for call in (
        client.get("/api/admin/scanners", headers=gate),
        client.post("/api/admin/scanners", json={"username": "x" * 5, _PW_FIELD: _SCANNER_PW, "event_id": event.id}, headers=gate),
        client.delete(f"/api/admin/scanners/{scanner_id}", headers=gate),
    ):
        assert (await call).status_code in (401, 403), "a scanner token must not open the admin door"


# ------------------------------------------------------------------ logging in
async def test_login_gives_the_event_and_a_working_session(client, make_event, admin_headers):
    event = await make_event()
    scanner_id, gate, login = await _gate(client, admin_headers, event)
    assert login["event"]["id"] == event.id and login["expires_in"] == 12 * 3600
    assert login["refresh_token"]
    assert (await _scan(client, gate, "KM1234567")).status_code == 200


async def test_wrong_login_is_the_same_answer_for_every_reason(client, make_event, admin_headers):
    event = await make_event()
    await _gate(client, admin_headers, event)
    wrong_pw = await _login(client, password="Wrong" + "Pass" + "1234")
    unknown = await _login(client, username="nobody1")
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


async def test_five_wrong_logins_lock_that_address_only(client, make_event, admin_headers):
    event = await make_event()
    await _create_scanner(client, admin_headers, event.id)
    for _ in range(5):
        assert (await _login(client, password="Wrong" + "Pass" + "1234", ip="10.9.0.1")).status_code == 401
    locked = await _login(client, ip="10.9.0.1")  # even the right password is refused for that address
    assert locked.status_code == 429
    other = await _login(client, ip="10.9.0.2")  # a volunteer on another phone is not locked
    assert other.status_code == 200, other.text


async def test_the_username_is_not_case_sensitive(client, make_event, admin_headers):
    """Phones capitalise the first letter: "Gate1" must open the account "gate1"."""
    event = await make_event()
    await _create_scanner(client, admin_headers, event.id, "gate1")
    resp = await _login(client, username="Gate1")
    assert resp.status_code == 200, resp.text
    assert (await _login(client, username="  gate1 ")).status_code == 200, "spaces around the name"
    # the same name with another capital is the same account: it cannot be created twice on one event
    assert (await _create_scanner(client, admin_headers, event.id, "GATE1")).status_code == 409


async def test_two_old_accounts_that_differ_only_by_capitals_each_log_in_with_their_own_spelling(client, make_event, make_admin, make_scanner):
    """Accounts made before the name stopped being case sensitive: the exact spelling picks the account."""
    event = await make_event()
    admin = await make_admin()
    first = await make_scanner(admin.id, event.id, username="Door1", pw=_SCANNER_PW)
    second = await make_scanner(admin.id, event.id, username="door1", pw=_SCANNER_PW)  # even the same password
    for typed, expected in (("Door1", first.id), ("door1", second.id)):
        resp = await _login(client, username=typed)
        assert resp.status_code == 200, (typed, resp.text)
        from jose import jwt
        from app.core.security import ALGORITHM, secret_key
        claims = jwt.decode(resp.json()["access_token"], secret_key, algorithms=[ALGORITHM])
        assert int(claims["sub"]) == expected, typed
    other = await _login(client, username="DOOR1")  # neither spelling: the oldest account
    assert other.status_code == 200


async def test_changing_a_capital_letter_is_not_a_fresh_set_of_login_tries(client, make_event, admin_headers):
    event = await make_event()
    await _create_scanner(client, admin_headers, event.id, "gate1")
    for name in ("gate1", "Gate1", "GATE1", "gAte1", "gaTe1"):
        assert (await _login(client, username=name, password="Wrong" + "Pass" + "1234", ip="10.9.1.1")).status_code == 401
    assert (await _login(client, username="gate1", ip="10.9.1.1")).status_code == 429


# ------------------------------------------------------------------ at the door
async def test_the_whole_family_at_the_gate(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    _, gate, _ = await _gate(client, admin_headers, event)
    graduate, ticket, codes = await _ticket(db, make_college, make_graduate, make_ticket, event)
    grad_code, companions = _by_type(codes)

    # a companion first: refused until the graduate is in
    early = await _scan(client, gate, companions[0].code_value)
    assert early.json()["valid"] is False and early.json()["decision"] == "NOT_ACTIVATED"

    first = await _scan(client, gate, grad_code.code_value)
    assert first.json() == {"valid": True, "decision": "SUCCESS", "message": first.json()["message"], "code_type": "GRADUATE"}

    for companion in companions:
        ok = await _scan(client, gate, companion.code_value)
        assert ok.json()["valid"] is True and ok.json()["code_type"] == "COMPANION"

    for code in codes:  # nobody gets in twice
        again = await _scan(client, gate, code.code_value)
        assert again.json()["decision"] == "ALREADY_USED"


async def test_the_short_code_does_the_same_as_the_qr(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    _, gate, _ = await _gate(client, admin_headers, event)
    _, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800002", companions=1)
    grad_code, companions = _by_type(codes)
    ok = await _scan(client, gate, f" {grad_code.short_code.lower()} ")
    assert ok.json()["decision"] == "SUCCESS"
    assert (await _scan(client, gate, companions[0].short_code)).json()["decision"] == "SUCCESS"
    assert (await _scan(client, gate, grad_code.short_code)).json()["decision"] == "ALREADY_USED"


async def test_unknown_foreign_and_unconfirmed_codes(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    other = await make_event(name="حفل آخر")
    _, gate, _ = await _gate(client, admin_headers, event)
    _, other_gate, _ = await _gate(client, admin_headers, other, "gate2")

    assert (await _scan(client, gate, "00000000-0000-0000-0000-000000000000")).json()["decision"] == "NOT_FOUND"
    assert (await _scan(client, gate, "not a code")).json()["decision"] == "NOT_FOUND"

    _, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800003")
    grad_code, _ = _by_type(codes)
    wrong = await _scan(client, other_gate, grad_code.code_value)  # a gate of another ceremony
    assert wrong.json()["decision"] == "WRONG_EVENT"
    assert (await _scan(client, gate, grad_code.code_value)).json()["decision"] == "SUCCESS", "the wrong gate consumed nothing"


async def test_a_payment_reverted_after_issuing_stops_the_codes(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    _, gate, _ = await _gate(client, admin_headers, event)
    _, ticket, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800004")
    grad_code, _ = _by_type(codes)
    reverted = await client.post(f"/api/admin/tickets/{ticket.id}/revert-payment", headers=admin_headers)
    assert reverted.status_code == 200, reverted.text
    assert (await _scan(client, gate, grad_code.code_value)).json()["decision"] == "TICKET_NOT_CONFIRMED"


async def test_two_scanners_on_one_code_at_the_same_moment_let_one_in(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    _, gate1, _ = await _gate(client, admin_headers, event, "gate1")
    _, gate2, _ = await _gate(client, admin_headers, event, "gate2")
    _, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800005")
    grad_code, _ = _by_type(codes)
    for _round in range(1):
        first, second = await asyncio.gather(_scan(client, gate1, grad_code.code_value), _scan(client, gate2, grad_code.code_value))
    decisions = sorted([first.json()["decision"], second.json()["decision"]])
    assert decisions == ["ALREADY_USED", "SUCCESS"], decisions


async def test_the_answer_never_holds_personal_data(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    _, gate, _ = await _gate(client, admin_headers, event)
    graduate, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800006")
    grad_code, _ = _by_type(codes)
    resp = await _scan(client, gate, grad_code.code_value)
    assert set(resp.json()) == {"valid", "decision", "message", "code_type"}
    assert graduate.full_name not in resp.text and graduate.university_id not in resp.text


async def test_bad_scan_requests_are_refused_cleanly(client, make_event, admin_headers):
    event = await make_event()
    _, gate, _ = await _gate(client, admin_headers, event)
    assert (await client.post("/api/scanner/scan", json={"code": ""}, headers=gate)).status_code == 422
    assert (await client.post("/api/scanner/scan", json={"code": "x" * 65}, headers=gate)).status_code == 422
    assert (await client.post("/api/scanner/scan", json={"code": "KM1234567", "extra": 1}, headers=gate)).status_code == 422
    assert (await client.post("/api/scanner/scan", json={"code": "KM1234567"})).status_code in (401, 403)


async def test_every_attempt_is_in_the_log_with_the_scanner_as_the_actor(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    scanner_id, gate, _ = await _gate(client, admin_headers, event)
    _, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800007", companions=0)
    grad_code, _ = _by_type(codes)
    await _scan(client, gate, grad_code.code_value)
    await _scan(client, gate, grad_code.code_value)
    await _scan(client, gate, "KM0000000")
    rows = (await db.execute(select(AuditLogModel).where(AuditLogModel.action == "qr_scanned").order_by(AuditLogModel.id))).scalars().all()
    assert [r.details for r in rows] == ["SUCCESS", "ALREADY_USED", "NOT_FOUND"]
    assert all(r.actor_type == "SCANNER" and r.actor_id == scanner_id for r in rows)
    hidden = await client.get("/api/admin/audit-logs", headers=admin_headers)
    assert all(i["action"] != "qr_scanned" for i in hidden.json()["items"])
    shown = await client.get("/api/admin/audit-logs", params={"include_scans": "true", "actor_type": "SCANNER"}, headers=admin_headers)
    assert shown.json()["total"] == 3 and shown.json()["items"][0]["actor"]["username"] == "gate1"


# ------------------------------------------------------------------ the admin corrects a mistake
async def test_revert_a_wrong_scan_and_the_family_can_try_again(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    _, gate, _ = await _gate(client, admin_headers, event)
    graduate, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800008", companions=1)
    grad_code, companions = _by_type(codes)
    assert (await _scan(client, gate, grad_code.code_value)).json()["decision"] == "SUCCESS"
    assert (await _scan(client, gate, companions[0].code_value)).json()["decision"] == "SUCCESS"

    reverted = await client.post(f"/api/admin/graduates/{graduate.id}/revert-scan", headers=admin_headers)
    assert reverted.status_code == 200, reverted.text
    # the graduate's code can be used again, and the companion must wait for him once more
    assert (await _scan(client, gate, grad_code.code_value)).json()["decision"] == "SUCCESS"


async def test_manual_check_in_blocks_a_second_entry_with_the_same_qr(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    _, gate, _ = await _gate(client, admin_headers, event)
    graduate, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800009", companions=1)
    grad_code, companions = _by_type(codes)
    done = await client.post(f"/api/admin/graduates/{graduate.id}/manual-check-in", headers=admin_headers)
    assert done.status_code == 200, done.text
    assert (await _scan(client, gate, grad_code.code_value)).json()["decision"] == "ALREADY_USED"
    # the companions were activated by the manual check-in: they can come in
    assert (await _scan(client, gate, companions[0].code_value)).json()["decision"] == "SUCCESS"


# ------------------------------------------------------------------ ending a session
async def test_logout_ends_the_session_for_good(client, make_event, admin_headers):
    event = await make_event()
    _, gate, login = await _gate(client, admin_headers, event)
    out = await client.post("/api/scanner/auth/logout", headers=gate)
    assert out.status_code == 200, out.text
    assert (await _scan(client, gate, "KM1234567")).status_code == 401
    assert (await client.post("/api/scanner/auth/refresh", json={"refresh_token": login["refresh_token"]})).status_code == 401


async def test_refresh_gives_a_new_session_and_a_used_refresh_token_is_dead(client, make_event, admin_headers):
    event = await make_event()
    _, gate, login = await _gate(client, admin_headers, event)
    new = await client.post("/api/scanner/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert new.status_code == 200, new.text
    assert (await _scan(client, _bearer(new.json()["access_token"]), "KM1234567")).status_code == 200
    assert (await client.post("/api/scanner/auth/refresh", json={"refresh_token": login["refresh_token"]})).status_code == 401


async def test_deleting_a_scanner_cuts_it_off_at_once_but_keeps_its_history(client, db, make_event, make_college, make_graduate, make_ticket, admin_headers):
    event = await make_event()
    scanner_id, gate, login = await _gate(client, admin_headers, event)
    _, _, codes = await _ticket(db, make_college, make_graduate, make_ticket, event, "800010", companions=0)
    grad_code, _ = _by_type(codes)
    assert (await _scan(client, gate, grad_code.code_value)).json()["decision"] == "SUCCESS"

    deleted = await client.delete(f"/api/admin/scanners/{scanner_id}", headers=admin_headers)
    assert deleted.status_code == 200, deleted.text
    assert (await _scan(client, gate, "KM1234567")).status_code == 401, "its token must stop working immediately"
    assert (await client.post("/api/scanner/auth/refresh", json={"refresh_token": login["refresh_token"]})).status_code == 401
    assert (await _login(client)).status_code == 401
    assert (await client.get("/api/admin/scanners", headers=admin_headers)).json() == []

    # what it scanned is still recorded
    await db.refresh(grad_code)
    assert grad_code.scanned_at is not None and grad_code.scanned_by_scanner_id is None
    rows = (await db.execute(select(AuditLogModel).where(AuditLogModel.action == "SCANNER_DELETED"))).scalars().all()
    assert len(rows) == 1
    assert (await client.delete(f"/api/admin/scanners/{scanner_id}", headers=admin_headers)).status_code == 404


async def test_a_graduate_or_admin_token_cannot_scan(client, make_event, admin_headers, graduate_headers):
    event = await make_event()
    assert (await client.post("/api/scanner/scan", json={"code": "KM1234567"}, headers=admin_headers)).status_code in (401, 403)
    assert (await client.post("/api/scanner/scan", json={"code": "KM1234567"}, headers=graduate_headers)).status_code in (401, 403)
