"""Tests for the asynchronous QR service (item 2.4 / 2.6).

Covers issuance idempotency, companion activation, every ``ScanDecision`` and
the audit row written for each attempt.
"""

import asyncio
import uuid

import pytest
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.audit_log import AuditLogModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum
from app.services.qr_service import (
    ScannerNotFoundError,
    ScanDecision,
    TicketNotEligibleError,
    activate_companion_codes,
    issue_qr_codes_for_ticket,
    scan_qr_code,
)


async def _codes(db, ticket_id):
    result = await db.execute(
        select(QrCodeModel).where(QrCodeModel.ticket_id == ticket_id)
    )
    return list(result.scalars().all())


async def _code_of_type(db, ticket_id, code_type):
    return (
        await db.execute(
            select(QrCodeModel).where(
                QrCodeModel.ticket_id == ticket_id,
                QrCodeModel.code_type == code_type,
            )
        )
    ).scalars().all()


async def _setup_ticket(
    db,
    make_event,
    make_college,
    make_graduate,
    make_ticket,
    *,
    ticket_type=2,
    status=TicketStatusEnum.CONFIRMED,
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id)
    ticket = await make_ticket(
        grad.id, event.id, ticket_type=ticket_type, status=status
    )
    return event, grad, ticket


async def test_issue_creates_graduate_and_companion_codes(
    db, make_event, make_college, make_graduate, make_ticket
):
    event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket,
        ticket_type=3,
    )

    created = await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()

    assert len(created) == 4
    codes = await _codes(db, ticket.id)
    graduate = [c for c in codes if c.code_type == QrCodeTypeEnum.GRADUATE]
    companions = [c for c in codes if c.code_type == QrCodeTypeEnum.COMPANION]
    assert len(graduate) == 1
    assert graduate[0].is_activated is True
    assert graduate[0].scanned_at is None
    assert graduate[0].code_value is not None
    assert len(companions) == 3
    assert all(c.is_activated is False for c in companions)


async def test_issue_is_idempotent(
    db, make_event, make_college, make_graduate, make_ticket
):
    _event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )

    first = await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    second = await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()

    assert len(first) == 3
    assert len(second) == 3
    assert {c.id for c in first} == {c.id for c in second}
    assert len(await _codes(db, ticket.id)) == 3


async def test_issue_rejects_non_confirmed_ticket(
    db, make_event, make_college, make_graduate, make_ticket
):
    _event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket,
        status=TicketStatusEnum.AWAITING_PAYMENT,
    )
    ticket_id = ticket.id

    with pytest.raises(TicketNotEligibleError):
        await issue_qr_codes_for_ticket(db, ticket_id)
    await db.rollback()

    assert await _codes(db, ticket_id) == []


async def test_issue_rejects_missing_ticket(db):
    with pytest.raises(TicketNotEligibleError):
        await issue_qr_codes_for_ticket(db, 999999)
    await db.rollback()


async def test_activate_companion_codes(
    db, make_event, make_college, make_graduate, make_ticket
):
    _event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()

    activated = await activate_companion_codes(db, ticket.id)
    await db.commit()

    assert activated == 2
    companions = await _code_of_type(db, ticket.id, QrCodeTypeEnum.COMPANION)
    assert all(c.is_activated is True for c in companions)


async def test_scan_graduate_success_activates_companions(
    db, make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    event, grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id)
    graduate_code = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.GRADUATE))[0]

    result = await scan_qr_code(db, str(graduate_code.code_value), scanner.id)
    await db.commit()

    assert result.decision is ScanDecision.SUCCESS
    assert result.graduate_id == grad.id
    await db.refresh(graduate_code)
    assert graduate_code.scanned_at is not None
    assert graduate_code.scanned_by_scanner_id == scanner.id
    companions = await _code_of_type(db, ticket.id, QrCodeTypeEnum.COMPANION)
    assert all(c.is_activated is True for c in companions)


async def test_scan_companion_before_graduate_is_not_activated(
    db, make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id)
    companion = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.COMPANION))[0]

    result = await scan_qr_code(db, str(companion.code_value), scanner.id)
    await db.commit()

    assert result.decision is ScanDecision.NOT_ACTIVATED


async def test_scan_twice_is_already_used(
    db, make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id)
    graduate_code = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.GRADUATE))[0]
    value = str(graduate_code.code_value)

    first = await scan_qr_code(db, value, scanner.id)
    await db.commit()
    second = await scan_qr_code(db, value, scanner.id)
    await db.commit()

    assert first.decision is ScanDecision.SUCCESS
    assert second.decision is ScanDecision.ALREADY_USED


async def test_scan_from_other_event_is_rejected(
    db, make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    other_event = await make_event(name="حفل آخر")
    admin = await make_admin()
    scanner = await make_scanner(admin.id, other_event.id)
    graduate_code = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.GRADUATE))[0]

    result = await scan_qr_code(db, str(graduate_code.code_value), scanner.id)
    await db.commit()

    assert result.decision is ScanDecision.WRONG_EVENT


async def test_scan_non_confirmed_ticket_is_rejected(
    db, make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    ticket.status = TicketStatusEnum.REJECTED
    ticket.confirmed_at = None
    await db.commit()
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id)
    graduate_code = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.GRADUATE))[0]

    result = await scan_qr_code(db, str(graduate_code.code_value), scanner.id)
    await db.commit()

    assert result.decision is ScanDecision.TICKET_NOT_CONFIRMED


async def test_scan_unknown_values_are_not_found(
    db, make_admin, make_event, make_scanner
):
    event = await make_event()
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id)

    malformed = await scan_qr_code(db, "not-a-uuid", scanner.id)
    unknown = await scan_qr_code(db, str(uuid.uuid4()), scanner.id)
    await db.commit()

    assert malformed.decision is ScanDecision.NOT_FOUND
    assert unknown.decision is ScanDecision.NOT_FOUND


async def test_scan_with_unknown_scanner_raises(
    db, make_event, make_college, make_graduate, make_ticket
):
    _event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    graduate_code = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.GRADUATE))[0]

    with pytest.raises(ScannerNotFoundError):
        await scan_qr_code(db, str(graduate_code.code_value), 999999)
    await db.rollback()


async def test_every_attempt_writes_an_audit_row(
    db, make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id)
    graduate_code = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.GRADUATE))[0]
    value = str(graduate_code.code_value)

    await scan_qr_code(db, value, scanner.id)
    await scan_qr_code(db, value, scanner.id)
    await scan_qr_code(db, "not-a-uuid", scanner.id)
    await db.commit()

    rows = (
        await db.execute(
            select(AuditLogModel).where(AuditLogModel.action == "qr_scanned")
        )
    ).scalars().all()

    assert len(rows) == 3
    assert all(row.actor_type.value == "SCANNER" for row in rows)
    assert all(row.actor_id == scanner.id for row in rows)
    decisions = sorted(row.details for row in rows)
    assert decisions == sorted(["SUCCESS", "ALREADY_USED", "NOT_FOUND"])


async def test_concurrent_scans_allow_a_single_success(
    db, make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    event, _grad, ticket = await _setup_ticket(
        db, make_event, make_college, make_graduate, make_ticket
    )
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()
    admin = await make_admin()
    scanner = await make_scanner(admin.id, event.id)
    graduate_code = (await _code_of_type(db, ticket.id, QrCodeTypeEnum.GRADUATE))[0]
    value = str(graduate_code.code_value)

    async def _run():
        async with AsyncSessionLocal() as session:
            outcome = await scan_qr_code(session, value, scanner.id)
            await session.commit()
            return outcome.decision

    results = await asyncio.gather(_run(), _run())

    assert results.count(ScanDecision.SUCCESS) == 1
    assert results.count(ScanDecision.ALREADY_USED) == 1
