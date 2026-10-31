"""Admin payment review and QR issuance (FR-17, FR-12).

Covers item 3.7 of M2:
- list the payment requests of an event (default PROCESSING),
- read one ticket with its full payment history,
- confirm a payment (and issue the QR codes in the same transaction),
- reject a payment with a short reason.

The current payment of a ticket is its latest ``payments`` row by id (D16).
Confirming and rejecting are allowed at any time, even after the registration
window ended (D9). Every action is written to the audit trail (FR-22/NFR).
"""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.payment import PaymentModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketModel, TicketStatusEnum
from app.services.admin_graduate_service import invalidate_admin_cache
from app.services.audit_log import ActorType, record_audit
from app.services.qr_service import issue_qr_codes_for_ticket
from app.services.seat_service import assign_seat_block, seat_labels


async def _current_payment(db: AsyncSession, ticket_id: int) -> PaymentModel | None:
    return (
        await db.execute(
            select(PaymentModel)
            .where(PaymentModel.ticket_id == ticket_id)
            .order_by(PaymentModel.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def list_event_payments_service(
    db: AsyncSession,
    event_id: int,
    ticket_status: TicketStatusEnum,
    limit: int,
    offset: int,
) -> dict:
    event = await db.get(EventModel, event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على الحفل.",
        )

    latest_payment = (
        select(PaymentModel.ticket_id, func.max(PaymentModel.id).label("payment_id"))
        .group_by(PaymentModel.ticket_id)
        .subquery()
    )

    base_conditions = (
        TicketModel.event_id == event_id,
        TicketModel.status == ticket_status,
    )

    total = (
        await db.execute(
            select(func.count()).select_from(TicketModel).where(*base_conditions)
        )
    ).scalar_one()

    rows = (
        await db.execute(
            select(TicketModel, GraduateModel, CollegeModel.name, PaymentModel)
            .join(GraduateModel, GraduateModel.id == TicketModel.graduate_id)
            .join(CollegeModel, CollegeModel.id == GraduateModel.college_id)
            .outerjoin(latest_payment, latest_payment.c.ticket_id == TicketModel.id)
            .outerjoin(PaymentModel, PaymentModel.id == latest_payment.c.payment_id)
            .where(*base_conditions)
            .order_by(
                func.coalesce(PaymentModel.submitted_at, TicketModel.created_at).asc(),
                TicketModel.id.asc(),
            )
            .offset(offset)
            .limit(limit)
        )
    ).all()

    items = []
    for ticket, graduate, college_name, payment in rows:
        items.append(
            {
                "ticket_id": ticket.id,
                "graduate": {
                    "id": graduate.id,
                    "full_name": graduate.full_name,
                    "university_id": graduate.university_id,
                    "college_name": college_name,
                },
                "companions_count": ticket.companions_count,
                "price": str(ticket.price),
                "status": ticket.status,
                "payment": (
                    {
                        "transaction_number": payment.transaction_number,
                        "amount": str(payment.amount),
                        "sender_name": payment.sender_name,
                        "submitted_at": payment.submitted_at,
                    }
                    if payment is not None
                    else None
                ),
                "amount_mismatch": bool(
                    payment is not None and payment.amount != ticket.price
                ),
                "seat": (
                    seat_labels(
                        event.seat_prefix, ticket.seat_start, ticket.companions_count
                    )
                    or {}
                ).get("range"),
            }
        )

    return {"total": total, "items": items}


async def get_event_payments_summary_service(db: AsyncSession, event_id: int) -> dict:
    """Totals for the stats cards, independent of any list filter."""
    if await db.get(EventModel, event_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الحفل.")

    latest_payment = (
        select(PaymentModel.ticket_id, func.max(PaymentModel.id).label("payment_id"))
        .group_by(PaymentModel.ticket_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(TicketModel.status, TicketModel.price, PaymentModel.amount)
            .outerjoin(latest_payment, latest_payment.c.ticket_id == TicketModel.id)
            .outerjoin(PaymentModel, PaymentModel.id == latest_payment.c.payment_id)
            .where(TicketModel.event_id == event_id)
        )
    ).all()

    counts = {"AWAITING_PAYMENT": 0, "PROCESSING": 0, "CONFIRMED": 0, "REJECTED": 0}
    confirmed_amount = Decimal("0")
    mismatch_processing = 0
    for st, price, amount in rows:
        key = st.value if hasattr(st, "value") else str(st)
        counts[key] = counts.get(key, 0) + 1
        if key == "CONFIRMED" and amount is not None:
            confirmed_amount += amount
        if key == "PROCESSING" and amount is not None and amount != price:
            mismatch_processing += 1

    return {
        "total_tickets": len(rows),
        "submitted": counts["PROCESSING"] + counts["CONFIRMED"] + counts["REJECTED"],
        "awaiting_payment": counts["AWAITING_PAYMENT"],
        "processing": counts["PROCESSING"],
        "confirmed": counts["CONFIRMED"],
        "rejected": counts["REJECTED"],
        "confirmed_amount": format(confirmed_amount, ".2f"),
        "mismatch_processing": mismatch_processing,
    }


async def get_admin_ticket_service(db: AsyncSession, ticket_id: int) -> dict:
    ticket = await db.get(TicketModel, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على التذكرة.",
        )

    graduate = await db.get(GraduateModel, ticket.graduate_id)
    college_name = None
    if graduate is not None:
        college = await db.get(CollegeModel, graduate.college_id)
        college_name = college.name if college is not None else None

    event = await db.get(EventModel, ticket.event_id)
    seat = None
    if ticket.seat_start is not None:
        seat = seat_labels(
            event.seat_prefix if event is not None else None,
            ticket.seat_start,
            ticket.companions_count,
        )

    payments = (
        await db.execute(
            select(PaymentModel)
            .where(PaymentModel.ticket_id == ticket_id)
            .order_by(PaymentModel.id.asc())
        )
    ).scalars().all()

    return {
        "id": ticket.id,
        "status": ticket.status,
        "companions_count": ticket.companions_count,
        "price": str(ticket.price),
        "created_at": ticket.created_at,
        "confirmed_at": ticket.confirmed_at,
        "rejection_reason": ticket.rejection_reason,
        "seat": seat,
        "graduate": (
            {
                "id": graduate.id,
                "full_name": graduate.full_name,
                "university_id": graduate.university_id,
                "college_name": college_name,
                "email": graduate.email,
                "phone": graduate.phone,
            }
            if graduate is not None
            else None
        ),
        "payments": [
            {
                "id": payment.id,
                "transaction_number": payment.transaction_number,
                "amount": str(payment.amount),
                "sender_name": payment.sender_name,
                "submitted_at": payment.submitted_at,
                "reviewed_at": payment.reviewed_at,
            }
            for payment in payments
        ],
    }


async def confirm_payment_service(
    db: AsyncSession, ticket_id: int, admin: dict
) -> dict:
    ticket = (
        await db.execute(
            select(TicketModel).where(TicketModel.id == ticket_id).with_for_update()
        )
    ).scalar_one_or_none()
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على التذكرة.",
        )

    payment = await _current_payment(db, ticket_id)
    if ticket.status != TicketStatusEnum.PROCESSING or payment is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.REQUEST_NOT_PROCESSING,
        )

    now = datetime.now(UTC)
    ticket.status = TicketStatusEnum.CONFIRMED
    ticket.confirmed_at = now
    ticket.rejection_reason = None
    db.add(ticket)

    payment.reviewed_at = now
    db.add(payment)

    # Persist the CONFIRMED status before issuing codes: the QR service locks
    # the ticket and checks the status, and autoflush is disabled.
    await db.flush()

    # Issued in the SAME transaction: a failure rolls back the whole
    # confirmation so a ticket is never left half-confirmed.
    await issue_qr_codes_for_ticket(db, ticket_id)

    # Reserve the ticket's seat block in the same transaction (FR-24 extension).
    await assign_seat_block(db, ticket)

    event = await db.get(EventModel, ticket.event_id)
    seat_range = seat_labels(
        event.seat_prefix if event is not None else None,
        ticket.seat_start,
        ticket.companions_count,
    )["range"]

    await record_audit(
        db,
        actor_type=ActorType.ADMIN,
        actor_id=admin["admin_id"],
        action="PAYMENT_CONFIRMED",
        target=f"Ticket ID {ticket_id}",
        details=(
            f"Confirmed payment for graduate ID {ticket.graduate_id} "
            f"(amount {payment.amount}, transaction {payment.transaction_number})"
        ),
        event_id=ticket.event_id,
        graduate_id=ticket.graduate_id,
        ticket_id=ticket_id,
    )

    await invalidate_admin_cache()
    return {"status": "success", "message": messages.PAYMENT_CONFIRMED, "seat": seat_range}


async def reject_payment_service(
    db: AsyncSession, ticket_id: int, reason: str, admin: dict
) -> dict:
    clean_reason = (reason or "").strip()
    if len(clean_reason) < 3 or len(clean_reason) > 255:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.REJECT_REASON_REQUIRED,
        )

    ticket = (
        await db.execute(
            select(TicketModel).where(TicketModel.id == ticket_id).with_for_update()
        )
    ).scalar_one_or_none()
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على التذكرة.",
        )
    if ticket.status != TicketStatusEnum.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.REQUEST_NOT_PROCESSING,
        )

    now = datetime.now(UTC)
    ticket.status = TicketStatusEnum.REJECTED
    ticket.rejection_reason = clean_reason
    db.add(ticket)

    payment = await _current_payment(db, ticket_id)
    if payment is not None:
        payment.reviewed_at = now
        db.add(payment)

    await record_audit(
        db,
        actor_type=ActorType.ADMIN,
        actor_id=admin["admin_id"],
        action="PAYMENT_REJECTED",
        target=f"Ticket ID {ticket_id}",
        details=(
            f"Rejected payment for graduate ID {ticket.graduate_id} "
            f"(reason: {clean_reason})"
        ),
        event_id=ticket.event_id,
        graduate_id=ticket.graduate_id,
        ticket_id=ticket_id,
    )

    await invalidate_admin_cache()
    return {"status": "success", "message": messages.PAYMENT_REJECTED}
