"""Graduate-side ticket selection, payment submission and "my ticket" data.

Implements the graduate flow of M2:
- 3.4 ticket options and selection (FR-7, FR-8)
- 3.5 payment information and submission (FR-9)
- 3.6 my ticket payload (FR-5, FR-10, FR-12 display)

Business rules that live here (and only here):
- Ticket selection and payment (re)submission are allowed ONLY while the
  event's registration window is open (D9); viewing data is always allowed.
- One ticket per graduate; the ticket type is final once chosen (D10).
- A ticket is AWAITING_PAYMENT right after selection and PROCESSING as soon as
  payment data is submitted (FR-9). The current payment of a ticket is its
  latest ``payments`` row by id (D16).
- For any status other than CONFIRMED the my-ticket payload exposes NO QR code
  values and NO WhatsApp link (FR-10 / FR-22-c).
"""

from datetime import UTC, datetime
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.payment import PaymentModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketModel, TicketStatusEnum, TicketTypeEnum
from app.schemas.ticket import PaymentSubmitRequest, TicketSelectRequest
from app.services.admin_graduate_service import invalidate_admin_cache
from app.services.registration_window import (
    ensure_registration_open,
    get_graduate_event,
)
from app.services.seat_service import seat_labels
from app.services.settings_service import (
    SHAMCASH_ACCOUNT_NUMBER,
    SHAMCASH_QR_IMAGE,
    SHAMCASH_RECEIVER_NAME,
    get_setting,
)

_PAYABLE_STATUSES = (TicketStatusEnum.AWAITING_PAYMENT, TicketStatusEnum.REJECTED)

_STATUS_MESSAGES = {
    TicketStatusEnum.AWAITING_PAYMENT: messages.TICKET_STATUS_AWAITING_PAYMENT,
    TicketStatusEnum.PROCESSING: messages.TICKET_STATUS_PROCESSING,
    TicketStatusEnum.CONFIRMED: messages.TICKET_STATUS_CONFIRMED,
    TicketStatusEnum.REJECTED: messages.TICKET_STATUS_REJECTED,
}


def _registration_info(event: EventModel | None) -> dict:
    if event is None:
        return {"is_open": False, "start": None, "end": None}
    now = datetime.now(UTC)
    is_open = True
    if event.registration_start is not None and now < event.registration_start:
        is_open = False
    if event.registration_end is not None and now > event.registration_end:
        is_open = False
    return {"is_open": is_open, "start": event.registration_start, "end": event.registration_end}


async def _get_graduate_ticket(db: AsyncSession, graduate_id: int) -> TicketModel | None:
    result = await db.execute(
        select(TicketModel).where(TicketModel.graduate_id == graduate_id)
    )
    return result.scalars().first()


async def _build_payment_info(
    db: AsyncSession, graduate: GraduateModel, ticket: TicketModel
) -> dict:
    receiver = await get_setting(db, SHAMCASH_RECEIVER_NAME)
    account = await get_setting(db, SHAMCASH_ACCOUNT_NUMBER)
    qr_image = await get_setting(db, SHAMCASH_QR_IMAGE)
    return {
        "amount": ticket.price,
        "receiver_name": receiver,
        "account_number": account,
        "qr_image_url": "/api/settings/shamcash-qr" if qr_image else None,
        "note_instruction": messages.payment_note_instruction(graduate.university_id),
    }


async def get_ticket_options_service(db: AsyncSession, graduate: GraduateModel) -> dict:
    event = await get_graduate_event(db, graduate)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=messages.REGISTRATION_NOT_OPEN,
        )

    ticket = await _get_graduate_ticket(db, graduate.id)

    options = [
        {
            "ticket_type": TicketTypeEnum.TWO_COMPANIONS,
            "companions_count": 2,
            "price": event.price_2_companions,
        }
    ]
    if event.is_3companions_enabled:
        options.append(
            {
                "ticket_type": TicketTypeEnum.THREE_COMPANIONS,
                "companions_count": 3,
                "price": event.price_3_companions,
            }
        )

    return {
        "event": event,
        "registration": _registration_info(event),
        "has_ticket": ticket is not None,
        "info_text": messages.TICKET_INFO_TEXT,
        "options": options,
    }


async def select_ticket_service(
    db: AsyncSession, graduate: GraduateModel, data: TicketSelectRequest
) -> dict:
    if not data.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.TICKET_CHOICE_NOT_CONFIRMED,
        )

    event = await get_graduate_event(db, graduate)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=messages.REGISTRATION_NOT_OPEN,
        )
    await ensure_registration_open(event)

    if (
        data.ticket_type == TicketTypeEnum.THREE_COMPANIONS
        and not event.is_3companions_enabled
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.THREE_COMPANIONS_DISABLED,
        )

    existing = await _get_graduate_ticket(db, graduate.id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.TICKET_ALREADY_EXISTS,
        )

    if data.ticket_type == TicketTypeEnum.TWO_COMPANIONS:
        companions_count = 2
        price = event.price_2_companions
    else:
        companions_count = 3
        price = event.price_3_companions

    ticket = TicketModel(
        graduate_id=graduate.id,
        event_id=event.id,
        ticket_type=data.ticket_type,
        companions_count=companions_count,
        price=price,
        status=TicketStatusEnum.AWAITING_PAYMENT,
    )
    db.add(ticket)
    try:
        await db.flush()
    except IntegrityError:
        # Two concurrent selections for the same graduate/event (D10).
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.TICKET_ALREADY_EXISTS,
        )
    await db.refresh(ticket)

    await invalidate_admin_cache()
    return ticket


async def get_payment_info_service(db: AsyncSession, graduate: GraduateModel) -> dict:
    ticket = await _get_graduate_ticket(db, graduate.id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=messages.NO_TICKET,
        )
    if ticket.status not in _PAYABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.PAYMENT_NOT_ALLOWED,
        )
    return await _build_payment_info(db, graduate, ticket)


async def submit_payment_service(
    db: AsyncSession, graduate: GraduateModel, data: PaymentSubmitRequest
) -> dict:
    event = await get_graduate_event(db, graduate)

    # Lock the ticket row so concurrent submissions serialise (D16 / atomicity).
    ticket = (
        await db.execute(
            select(TicketModel)
            .where(TicketModel.graduate_id == graduate.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=messages.NO_TICKET,
        )
    if ticket.status not in _PAYABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.PAYMENT_NOT_ALLOWED,
        )
    await ensure_registration_open(event)

    existing_payment = (
        await db.execute(
            select(PaymentModel).where(
                PaymentModel.transaction_number == data.transaction_number
            )
        )
    ).scalar_one_or_none()

    if existing_payment is not None and existing_payment.ticket_id != ticket.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.TRANSACTION_ALREADY_USED,
        )

    if existing_payment is not None:
        # Same number, same ticket: refresh the row instead of inserting (D16).
        existing_payment.amount = data.amount
        existing_payment.sender_name = data.sender_name
        existing_payment.reviewed_at = None
        db.add(existing_payment)
    else:
        db.add(
            PaymentModel(
                ticket_id=ticket.id,
                transaction_number=data.transaction_number,
                amount=data.amount,
                sender_name=data.sender_name,
            )
        )

    ticket.status = TicketStatusEnum.PROCESSING
    ticket.rejection_reason = None
    db.add(ticket)

    try:
        await db.flush()
    except IntegrityError:
        # Race on the global unique transaction number.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=messages.TRANSACTION_ALREADY_USED,
        )

    await invalidate_admin_cache()
    return {"status": "PROCESSING", "message": messages.PAYMENT_SUBMITTED}


async def get_my_ticket_service(db: AsyncSession, graduate: GraduateModel) -> dict:
    event = await get_graduate_event(db, graduate)
    registration = _registration_info(event)

    ticket = await _get_graduate_ticket(db, graduate.id)
    if ticket is None:
        return {
            "has_ticket": False,
            "registration": registration,
            "top_rank": graduate.top_rank,
        }

    result = {
        "has_ticket": True,
        "registration": registration,
        "ticket": ticket,
        "event": event,
        "message": _STATUS_MESSAGES.get(ticket.status),
        "top_rank": graduate.top_rank,
    }

    if ticket.status in _PAYABLE_STATUSES:
        result["payment_info"] = await _build_payment_info(db, graduate, ticket)
    elif ticket.status == TicketStatusEnum.CONFIRMED:
        codes = (
            await db.execute(
                select(QrCodeModel)
                .where(QrCodeModel.ticket_id == ticket.id)
                .order_by(QrCodeModel.id)
            )
        ).scalars().all()
        # The graduate code is always shown first (FR-12).
        codes = sorted(
            codes,
            key=lambda c: (c.code_type != QrCodeTypeEnum.GRADUATE, c.id),
        )
        result["qr_codes"] = [
            {
                "id": code.id,
                "code_type": code.code_type,
                "code_value": str(code.code_value),
                "is_activated": code.is_activated,
                "scanned": code.scanned_at is not None,
            }
            for code in codes
        ]
        result["whatsapp_group_link"] = (
            event.whatsapp_group_link if event is not None else None
        )
        result["seat"] = seat_labels(
            event.seat_prefix if event is not None else None,
            ticket.seat_start,
            ticket.companions_count,
        )

    return result
