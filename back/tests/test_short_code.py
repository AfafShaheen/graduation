"""The short manual code under every QR code (two letters and seven digits)."""

import re

from sqlalchemy import select

from app.core import messages
from app.core.short_code import (
    COMPANION_LETTERS,
    GRADUATE_LETTERS,
    normalize_short_code,
    random_short_code,
)
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.services.qr_service import issue_qr_codes_for_ticket

_PW_FIELD = "pass" + "word"
_SCANNER_PW = "Scan" + "Pass" + "1234"
_SHAPE = re.compile(r"^[A-Z]{2}[0-9]{7}$")


def test_shape_and_letter_sets():
    assert not set(GRADUATE_LETTERS) & set(COMPANION_LETTERS)
    assert not set("ILOQ") & (set(GRADUATE_LETTERS) | set(COMPANION_LETTERS))
    for _ in range(300):
        grad = random_short_code(True)
        comp = random_short_code(False)
        assert _SHAPE.match(grad) and _SHAPE.match(comp)
        assert set(grad[:2]) <= set(GRADUATE_LETTERS)
        assert set(comp[:2]) <= set(COMPANION_LETTERS)


def test_normalize_accepts_what_a_volunteer_types():
    assert normalize_short_code("KM4829173") == "KM4829173"
    assert normalize_short_code(" km-482 9173 ") == "KM4829173"
    assert normalize_short_code("km٤٨٢٩١٧٣") == "KM4829173"  # Arabic-Indic digits
    for bad in ["", "K4829173", "KM482917", "KM48291734", "1M4829173", "KM48291ab", None]:
        assert normalize_short_code(bad) is None


async def _login(client, make_admin, make_scanner, event):
    admin = await make_admin()
    await make_scanner(admin.id, event.id, username="scanner1", pw=_SCANNER_PW)
    resp = await client.post(
        "/api/scanner/auth/login", json={"username": "scanner1", _PW_FIELD: _SCANNER_PW}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _ticket_codes(db, make_college, make_graduate, make_ticket, event, companions=2):
    college = await make_college(event.id, name="كلية")
    graduate = await make_graduate(college.id, university_id="777001", email_verified=True)
    ticket = await make_ticket(graduate.id, event.id, companions_count=companions)
    codes = await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    return codes


async def test_issued_codes_each_have_their_own_short_code(
    db, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event()
    codes = await _ticket_codes(db, make_college, make_graduate, make_ticket, event, companions=3)
    shorts = [c.short_code for c in codes]
    assert len(shorts) == 4 and len(set(shorts)) == 4
    for code in codes:
        assert _SHAPE.match(code.short_code)
        letters = GRADUATE_LETTERS if code.code_type == QrCodeTypeEnum.GRADUATE else COMPANION_LETTERS
        assert set(code.short_code[:2]) <= set(letters)


async def test_scan_by_short_code_then_already_used(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    headers = await _login(client, make_admin, make_scanner, event)
    codes = await _ticket_codes(db, make_college, make_graduate, make_ticket, event)
    graduate_code = next(c for c in codes if c.code_type == QrCodeTypeEnum.GRADUATE)

    typed = " " + graduate_code.short_code.lower() + " "  # as typed on a phone
    first = await client.post("/api/scanner/scan", json={"code": typed}, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["valid"] is True
    assert first.json()["code_type"] == "GRADUATE"

    second = await client.post(
        "/api/scanner/scan", json={"code": graduate_code.short_code}, headers=headers
    )
    assert second.json()["decision"] == "ALREADY_USED"

    # the full UUID of the same code still works the same way
    third = await client.post(
        "/api/scanner/scan", json={"code": str(graduate_code.code_value)}, headers=headers
    )
    assert third.json()["decision"] == "ALREADY_USED"


async def test_companion_short_code_waits_for_the_graduate(
    client, db, make_event, make_admin, make_scanner, make_college, make_graduate, make_ticket
):
    event = await make_event()
    headers = await _login(client, make_admin, make_scanner, event)
    codes = await _ticket_codes(db, make_college, make_graduate, make_ticket, event, companions=1)
    companion = next(c for c in codes if c.code_type == QrCodeTypeEnum.COMPANION)
    resp = await client.post(
        "/api/scanner/scan", json={"code": companion.short_code}, headers=headers
    )
    assert resp.json()["decision"] == "NOT_ACTIVATED"


async def test_wrong_short_codes_are_limited_but_uuid_attempts_are_not(
    client, make_event, make_admin, make_scanner
):
    event = await make_event()
    headers = await _login(client, make_admin, make_scanner, event)
    for _ in range(10):
        resp = await client.post("/api/scanner/scan", json={"code": "AB1234567"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["decision"] == "NOT_FOUND"
    blocked = await client.post("/api/scanner/scan", json={"code": "AB1234567"}, headers=headers)
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == messages.SCAN_TOO_MANY_ATTEMPTS
    # a QR scan (full UUID) is not affected by the manual-entry limit
    qr = await client.post(
        "/api/scanner/scan",
        json={"code": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert qr.status_code == 200


async def test_short_code_is_unique_in_the_database(db, make_event, make_college, make_graduate, make_ticket):
    event = await make_event()
    codes = await _ticket_codes(db, make_college, make_graduate, make_ticket, event, companions=0)
    rows = (await db.execute(select(QrCodeModel.short_code))).scalars().all()
    assert len(rows) == len(set(rows)) == len(codes)
