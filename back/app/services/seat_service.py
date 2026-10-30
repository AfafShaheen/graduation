"""Seat label allocation and formatting.

A seat label is an optional event letter plus a sequence number, e.g. ``E-17``
or, when the event has no letter, ``17``. Labels are assigned when a payment is
confirmed: one seat number per graduate; companions have no seat.

Rules that live here (and only here):
- Assignment is idempotent: a ticket that already has a ``seat_start`` keeps it.
- The event row is locked while the next free block is computed so two
  confirmations of the same event can never reserve the same numbers.
- The seat label is presentation only; it is NEVER part of the QR value
  (SRS FR-12).
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import EventModel
from app.models.ticket import TicketModel


async def assign_seat_block(db: AsyncSession, ticket: TicketModel) -> None:
    """Reserve the next free seat block of the ticket's event.

    No-op when the ticket already has a ``seat_start``. Otherwise the event row
    is locked, the next free number computed from the highest allocated seat of
    the event, and ``ticket.seat_start`` set to it. Only ``flush``-es; the caller
    owns the transaction.
    """
    if ticket.seat_start is not None:
        return

    await db.execute(
        select(EventModel.id)
        .where(EventModel.id == ticket.event_id)
        .with_for_update()
    )

    highest = (
        await db.execute(
            select(func.max(TicketModel.seat_start)).where(
                TicketModel.event_id == ticket.event_id,
                TicketModel.seat_start.is_not(None),
            )
        )
    ).scalar_one_or_none()

    ticket.seat_start = (highest or 0) + 1
    db.add(ticket)
    await db.flush()


def seat_labels(prefix, seat_start, companions_count=0):
    """Seat label of the GRADUATE only (companions have no seats)."""
    if seat_start is None:
        return None
    graduate = f"{prefix}-{seat_start}" if prefix else str(seat_start)
    return {"graduate": graduate, "companions": [], "range": graduate}
