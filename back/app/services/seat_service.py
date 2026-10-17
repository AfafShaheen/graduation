"""Seat label allocation and formatting.

A seat label is an optional event letter plus a sequence number, e.g. ``E-17``
or, when the event has no letter, ``17``. Labels are assigned when a payment is
confirmed: each ticket reserves ``1 + companions_count`` consecutive numbers in
which the graduate takes the first number and the companions follow.

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
            select(
                func.max(TicketModel.seat_start + TicketModel.companions_count)
            ).where(
                TicketModel.event_id == ticket.event_id,
                TicketModel.seat_start.is_not(None),
            )
        )
    ).scalar_one_or_none()

    ticket.seat_start = (highest or 0) + 1
    db.add(ticket)
    await db.flush()


def seat_labels(
    prefix: str | None, seat_start: int | None, companions_count: int
) -> dict | None:
    """Build the display labels of a ticket's seat block.

    Returns ``None`` when no seat is allocated. Otherwise a dict with the
    graduate label, the companion labels in order, and a ``range`` string
    (e.g. ``E-17 -> E-19``).
    """

    def label(number: int) -> str:
        return f"{prefix}-{number}" if prefix else str(number)

    if seat_start is None:
        return None

    graduate = label(seat_start)
    companions = [
        label(seat_start + offset) for offset in range(1, companions_count + 1)
    ]
    range_text = f"{graduate} \u2192 {companions[-1]}" if companions else graduate
    return {"graduate": graduate, "companions": companions, "range": range_text}
