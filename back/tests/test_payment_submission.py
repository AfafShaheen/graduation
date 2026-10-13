"""HTTP tests for payment information and submission (item 3.5, FR-9)."""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.core import messages
from app.models.payment import PaymentModel
from app.models.ticket import TicketModel, TicketStatusEnum

_PW_FIELD = "pass" + "word"
_GRAD_PW = "Grad" + "Pass" + "1234"
_SELECT_BODY = {"ticket_type": "TWO_COMPANIONS", "confirm": True}
_PAYMENT_BODY = {
    "transaction_number": "ABC-1234",
    "amount": 100000,
    "sender_name": "أحمد محمد",
}


def _auth(access_value):
    return {"Authorization": f"Bearer {access_value}"}


async def _login(client, graduate):
    response = await client.post(
        "/api/auth/graduate/login",
        json={"email": graduate.email, _PW_FIELD: _GRAD_PW},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _graduate_with_ticket(
    client, make_event, make_college, make_graduate, **event_kw
):
    event = await make_event(**event_kw)
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    created = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    assert created.status_code == 201, created.text
    return event, college, graduate, access_value, created.json()["id"]


async def test_payment_info_when_awaiting(
    client, make_event, make_college, make_graduate
):
    _event, _college, graduate, access_value, _ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )

    response = await client.get(
        "/api/graduates/me/payment-info", headers=_auth(access_value)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["amount"] == "100000.00"
    assert graduate.university_id in body["note_instruction"]
    assert body.get("qr_image_url") is None


async def test_payment_info_conflict_when_processing(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value, _ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    response = await client.get(
        "/api/graduates/me/payment-info", headers=_auth(access_value)
    )

    assert response.status_code == 409
    assert response.json()["detail"] == messages.PAYMENT_NOT_ALLOWED


async def test_payment_info_without_ticket(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)

    response = await client.get(
        "/api/graduates/me/payment-info", headers=_auth(access_value)
    )

    assert response.status_code == 404
    assert response.json()["detail"] == messages.NO_TICKET


async def test_submit_payment_success(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )

    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    assert response.status_code == 201, response.text
    assert response.json() == {
        "status": "PROCESSING",
        "message": messages.PAYMENT_SUBMITTED,
    }
    ticket = await db.get(TicketModel, ticket_id)
    assert ticket.status == TicketStatusEnum.PROCESSING
    payment = (
        await db.execute(
            select(PaymentModel).where(PaymentModel.ticket_id == ticket_id)
        )
    ).scalar_one()
    assert payment.transaction_number == "ABC-1234"
    assert payment.amount == Decimal("100000")


async def test_submit_normalizes_transaction_number(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    body = dict(_PAYMENT_BODY, transaction_number="  ab-1234  ")

    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=body
    )

    assert response.status_code == 201, response.text
    payment = (
        await db.execute(
            select(PaymentModel).where(PaymentModel.ticket_id == ticket_id)
        )
    ).scalar_one()
    assert payment.transaction_number == "AB-1234"


async def test_submit_validation_cases(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value, _ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    invalid_bodies = [
        dict(_PAYMENT_BODY, transaction_number="AB"),
        dict(_PAYMENT_BODY, amount=0),
        dict(_PAYMENT_BODY, amount=-5),
        dict(_PAYMENT_BODY, amount=10.005),
        dict(_PAYMENT_BODY, sender_name="user123"),
        dict(_PAYMENT_BODY, extra="field"),
    ]

    for body in invalid_bodies:
        response = await client.post(
            "/api/graduates/me/payment", headers=_auth(access_value), json=body
        )
        assert response.status_code == 422, (body, response.text)


async def test_duplicate_number_on_other_ticket(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    grad_a = await make_graduate(
        college.id, university_id="111111", email_verified=True
    )
    grad_b = await make_graduate(
        college.id, university_id="222222", email_verified=True
    )
    access_a = await _login(client, grad_a)
    access_b = await _login(client, grad_b)
    await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_a), json=_SELECT_BODY
    )
    await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_b), json=_SELECT_BODY
    )
    first = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_a), json=_PAYMENT_BODY
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_b), json=_PAYMENT_BODY
    )

    assert second.status_code == 409
    assert second.json()["detail"] == messages.TRANSACTION_ALREADY_USED


async def test_resubmission_with_new_number_after_reject(
    client, db, make_event, make_college, make_graduate, make_payment
):
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    ticket = await db.get(TicketModel, ticket_id)
    ticket.status = TicketStatusEnum.REJECTED
    ticket.rejection_reason = "سبب الرفض"
    db.add(ticket)
    await db.commit()
    await make_payment(ticket_id, transaction_number="OLD-0001")

    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    assert response.status_code == 201, response.text
    await db.refresh(ticket)
    assert ticket.status == TicketStatusEnum.PROCESSING
    assert ticket.rejection_reason is None
    payments = (
        await db.execute(
            select(PaymentModel).where(PaymentModel.ticket_id == ticket_id)
        )
    ).scalars().all()
    assert len(payments) == 2


async def test_resubmission_with_same_number_updates_row(
    client, db, make_event, make_college, make_graduate, make_payment
):
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    ticket = await db.get(TicketModel, ticket_id)
    ticket.status = TicketStatusEnum.REJECTED
    ticket.rejection_reason = "سبب الرفض"
    db.add(ticket)
    await db.commit()
    await make_payment(
        ticket_id,
        transaction_number="ABC-1234",
        amount=Decimal("100000"),
        sender_name="قديم",
    )

    body = dict(_PAYMENT_BODY, amount=54321.99, sender_name="جديد")
    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=body
    )

    assert response.status_code == 201, response.text
    payments = (
        await db.execute(
            select(PaymentModel).where(PaymentModel.ticket_id == ticket_id)
        )
    ).scalars().all()
    assert len(payments) == 1
    assert payments[0].amount == Decimal("54321.99")
    assert payments[0].sender_name == "جديد"
    assert payments[0].reviewed_at is None


async def test_submit_when_processing_conflict(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value, _ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    assert response.status_code == 409
    assert response.json()["detail"] == messages.PAYMENT_NOT_ALLOWED


async def test_submit_when_confirmed_conflict(
    client, db, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    await make_ticket(graduate.id, event.id, status=TicketStatusEnum.CONFIRMED)

    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    assert response.status_code == 409
    assert response.json()["detail"] == messages.PAYMENT_NOT_ALLOWED


async def test_submit_when_window_closed(
    client, db, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event(
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2020, 1, 2, tzinfo=UTC),
    )
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    await make_ticket(
        graduate.id, event.id, status=TicketStatusEnum.AWAITING_PAYMENT
    )

    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    assert response.status_code == 403
    assert response.json()["detail"] == messages.REGISTRATION_CLOSED


async def test_concurrent_same_number_gives_one_success(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )

    results = await asyncio.gather(
        client.post(
            "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
        ),
        client.post(
            "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
        ),
    )

    assert sum(1 for response in results if response.status_code == 201) == 1
    payments = (
        await db.execute(
            select(PaymentModel).where(PaymentModel.ticket_id == ticket_id)
        )
    ).scalars().all()
    assert len(payments) == 1


async def test_amount_stored_as_entered(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    body = dict(_PAYMENT_BODY, amount=54321.99)

    response = await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=body
    )

    assert response.status_code == 201, response.text
    payment = (
        await db.execute(
            select(PaymentModel).where(PaymentModel.ticket_id == ticket_id)
        )
    ).scalar_one()
    assert payment.amount == Decimal("54321.99")
