"""Database-level tests for the QR code constraints introduced in item 2.2.

The partial unique index guarantees at most one GRADUATE code per ticket and
the two CHECK constraints encode the lifecycle rules of item 2.3.
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.database import AsyncSessionLocal
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum


async def _make_confirmed_ticket(
    make_event, make_college, make_graduate, make_ticket
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id)
    ticket = await make_ticket(
        grad.id, event.id, status=TicketStatusEnum.CONFIRMED
    )
    return ticket


async def test_only_one_graduate_code_per_ticket(
    make_event, make_college, make_graduate, make_ticket
):
    ticket = await _make_confirmed_ticket(
        make_event, make_college, make_graduate, make_ticket
    )

    async with AsyncSessionLocal() as session:
        session.add(
            QrCodeModel(
                ticket_id=ticket.id,
                code_type=QrCodeTypeEnum.GRADUATE,
                is_activated=True,
            )
        )
        await session.commit()

    with pytest.raises(IntegrityError):
        async with AsyncSessionLocal() as session:
            session.add(
                QrCodeModel(
                    ticket_id=ticket.id,
                    code_type=QrCodeTypeEnum.GRADUATE,
                    is_activated=True,
                )
            )
            await session.commit()


async def test_many_companion_codes_per_ticket_are_allowed(
    make_event, make_college, make_graduate, make_ticket
):
    ticket = await _make_confirmed_ticket(
        make_event, make_college, make_graduate, make_ticket
    )

    async with AsyncSessionLocal() as session:
        for _ in range(3):
            session.add(
                QrCodeModel(
                    ticket_id=ticket.id,
                    code_type=QrCodeTypeEnum.COMPANION,
                    is_activated=False,
                )
            )
        await session.commit()


async def test_scanned_at_requires_activation(
    make_event, make_college, make_graduate, make_ticket
):
    ticket = await _make_confirmed_ticket(
        make_event, make_college, make_graduate, make_ticket
    )

    with pytest.raises(IntegrityError):
        async with AsyncSessionLocal() as session:
            session.add(
                QrCodeModel(
                    ticket_id=ticket.id,
                    code_type=QrCodeTypeEnum.COMPANION,
                    is_activated=False,
                    scanned_at=datetime.now(UTC),
                )
            )
            await session.commit()


async def test_scanned_by_requires_scanned_at(
    make_event, make_college, make_graduate, make_ticket, make_admin, make_scanner
):
    ticket = await _make_confirmed_ticket(
        make_event, make_college, make_graduate, make_ticket
    )
    admin = await make_admin()
    scanner = await make_scanner(admin.id, ticket.event_id)

    with pytest.raises(IntegrityError):
        async with AsyncSessionLocal() as session:
            session.add(
                QrCodeModel(
                    ticket_id=ticket.id,
                    code_type=QrCodeTypeEnum.COMPANION,
                    is_activated=True,
                    scanned_at=None,
                    scanned_by_scanner_id=scanner.id,
                )
            )
            await session.commit()


async def test_activation_without_scan_is_allowed(
    make_event, make_college, make_graduate, make_ticket
):
    ticket = await _make_confirmed_ticket(
        make_event, make_college, make_graduate, make_ticket
    )

    async with AsyncSessionLocal() as session:
        session.add(
            QrCodeModel(
                ticket_id=ticket.id,
                code_type=QrCodeTypeEnum.GRADUATE,
                is_activated=True,
                scanned_at=None,
            )
        )
        await session.commit()
