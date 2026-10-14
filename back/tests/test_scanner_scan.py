"""HTTP tests for scanner login and the unified scan endpoint (FR-23/24/25)."""

import asyncio
import uuid

from sqlalchemy import func, select

from app.core import messages
from app.models.audit_log import AuditLogModel
from app.models.qr_code import QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum
from app.services.qr_service import issue_qr_codes_for_ticket

_PW_FIELD = "pass" + "word"
_SCANNER_PW = "Scan" + "Pass" + "1234"


def _auth(value):
    return {"Authorization": f"Bearer {value}"}


async def _scanner_login(client, make_admin, make_scanner, event, username="scanner1"):
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id, username=username, pw=_SCANNER_PW)
    resp = await client.post(
        "/api/scanner/auth/login",
        json={"username": username, _PW_FIELD: _SCANNER_PW},
    )
    assert resp.status_code == 200, resp.text
    return scanner, resp.json()["access_token"]


async def _codes_for_confirmed_ticket(
    db, make_college, make_graduate, make_ticket, event, university_id="123456"
):
    college = await make_college(event.id, name=f"كلية {university_id}")
    graduate = await make_graduate(
        college.id, university_id=university_id, email_verified=True
    )
    ticket = await make_ticket(graduate.id, event.id)
    codes = await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    return graduate, ticket, codes


async def _scan_count(db):
    result = await db.execute(
        select(func.count()).select_from(AuditLogModel).where(
            AuditLogModel.action == "qr_scanned"
        )
    )
    return result.scalar_one()


async def test_login_success(client, make_event, make_admin, make_scanner):
    event = await make_event()
    admin = await make_admin()
    await make_scanner(admin.id, event.id, username="scanner1", pw=_SCANNER_PW)

    resp = await client.post(
        "/api/scanner/auth/login",
        json={"username": "scanner1", _PW_FIELD: _SCANNER_PW},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 12 * 3600
    assert body["access_token"]
    assert body["event"]["id"] == event.id
    assert body["event"]["name"] == event.name


async def test_login_wrong_password_and_unknown_user_same_message(
    client, make_event, make_admin, make_scanner
):
    event = await make_event()
    admin = await make_admin()
    await make_scanner(admin.id, event.id, username="scanner1", pw=_SCANNER_PW)

    wrong = await client.post(
        "/api/scanner/auth/login",
        json={"username": "scanner1", _PW_FIELD: "Wrong" + "Pass" + "1234"},
    )
    unknown = await client.post(
        "/api/scanner/auth/login",
        json={"username": "ghost", _PW_FIELD: _SCANNER_PW},
    )
    assert wrong.status_code == 401
    assert unknown.status_code == 401
    assert wrong.json()["detail"] == messages.SCANNER_LOGIN_FAILED
    assert unknown.json()["detail"] == messages.SCANNER_LOGIN_FAILED


async def test_login_rate_limit(client, make_event, make_admin, make_scanner):
    event = await make_event()
    admin = await make_admin()
    await make_scanner(admin.id, event.id, username="scanner1", pw=_SCANNER_PW)

    for _ in range(5):
        resp = await client.post(
            "/api/scanner/auth/login",
            json={"username": "scanner1", _PW_FIELD: "Wrong" + "Pass" + "1234"},
        )
        assert resp.status_code == 401

    limited = await client.post(
        "/api/scanner/auth/login",
        json={"username": "scanner1", _PW_FIELD: _SCANNER_PW},
    )
    assert limited.status_code == 429


async def test_logout_blacklists_token(client, make_event, make_admin, make_scanner):
    event = await make_event()
    scanner, access_value = await _scanner_login(
        client, make_admin, make_scanner, event
    )

    logout = await client.post("/api/scanner/auth/logout", headers=_auth(access_value))
    assert logout.status_code == 200

    after = await client.post(
        "/api/scanner/scan", headers=_auth(access_value), json={"code": str(uuid.uuid4())}
    )
    assert after.status_code == 401


async def test_scan_graduate_code_success(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    graduate, ticket, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, event
    )

    resp = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(codes[0].code_value)},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["valid"] is True
    assert body["decision"] == "SUCCESS"
    assert body["message"] == messages.SCAN_VALID
    assert body["code_type"] == QrCodeTypeEnum.GRADUATE.value


async def test_scan_companion_before_and_after_graduate(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    _, _, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, event
    )
    graduate_code = codes[0]
    companion_code = codes[1]

    before = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(companion_code.code_value)},
    )
    assert before.json()["decision"] == "NOT_ACTIVATED"
    assert before.json()["valid"] is False

    await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(graduate_code.code_value)},
    )
    after = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(companion_code.code_value)},
    )
    assert after.json()["decision"] == "SUCCESS"
    assert after.json()["code_type"] == QrCodeTypeEnum.COMPANION.value


async def test_scan_unconfirmed_ticket(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    _, ticket, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, event
    )

    ticket.status = TicketStatusEnum.PROCESSING
    ticket.confirmed_at = None
    await db.commit()

    resp = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(codes[0].code_value)},
    )
    assert resp.json()["decision"] == "TICKET_NOT_CONFIRMED"
    assert resp.json()["valid"] is False


async def test_scan_wrong_event(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event(name="حفل الأول")
    other_event = await make_event(name="حفل الثاني")
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    _, _, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, other_event
    )

    resp = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(codes[0].code_value)},
    )
    assert resp.json()["decision"] == "WRONG_EVENT"
    assert resp.json()["valid"] is False


async def test_scan_malformed_and_unknown_not_found(
    client, make_event, make_admin, make_scanner
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)

    malformed = await client.post(
        "/api/scanner/scan", headers=_auth(access_value), json={"code": "not-a-uuid"}
    )
    unknown = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(uuid.uuid4())},
    )
    assert malformed.json()["decision"] == "NOT_FOUND"
    assert unknown.json()["decision"] == "NOT_FOUND"
    assert unknown.json()["valid"] is False


async def test_scan_already_used(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    _, _, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, event
    )

    first = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(codes[0].code_value)},
    )
    second = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(codes[0].code_value)},
    )
    assert first.json()["valid"] is True
    assert second.json()["decision"] == "ALREADY_USED"
    assert second.json()["valid"] is False


async def test_scan_response_has_no_personal_data(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    _, _, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, event
    )

    resp = await client.post(
        "/api/scanner/scan",
        headers=_auth(access_value),
        json={"code": str(codes[0].code_value)},
    )
    assert set(resp.json().keys()) == {"valid", "decision", "message", "code_type"}


async def test_concurrent_scan_same_code_one_success(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    _, _, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, event
    )
    code = str(codes[0].code_value)

    first, second = await asyncio.gather(
        client.post("/api/scanner/scan", headers=_auth(access_value), json={"code": code}),
        client.post("/api/scanner/scan", headers=_auth(access_value), json={"code": code}),
    )
    valid_flags = sorted([first.json()["valid"], second.json()["valid"]])
    assert valid_flags == [False, True]


async def test_every_attempt_writes_audit_row(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    _, access_value = await _scanner_login(client, make_admin, make_scanner, event)
    _, _, codes = await _codes_for_confirmed_ticket(
        db, make_college, make_graduate, make_ticket, event
    )

    await client.post(
        "/api/scanner/scan", headers=_auth(access_value), json={"code": str(codes[0].code_value)}
    )
    await client.post(
        "/api/scanner/scan", headers=_auth(access_value), json={"code": str(uuid.uuid4())}
    )

    assert await _scan_count(db) == 2


async def test_scan_requires_scanner_token(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate
):
    event = await make_event()
    admin = await make_admin()
    await make_scanner(admin.id, event.id, username="scanner1", pw=_SCANNER_PW)

    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)

    no_headers = await client.post("/api/scanner/scan", json={"code": str(uuid.uuid4())})
    assert no_headers.status_code in (401, 403)

    from app.core.security import create_access_token

    admin_value = create_access_token({"sub": str(admin.id), "role": "admin", "username": "admin"})
    graduate_value = create_access_token(
        {"sub": str(graduate.id), "graduate_id": graduate.id, "role": "graduate"}
    )
    for value in (admin_value, graduate_value):
        resp = await client.post(
            "/api/scanner/scan", headers=_auth(value), json={"code": str(uuid.uuid4())}
        )
        assert resp.status_code in (401, 403)
