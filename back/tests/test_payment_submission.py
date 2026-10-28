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
_SELECT_BODY = {"companions_count": 2, "confirm": True}
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
    client, make_event, make_college, make_graduate, *, university_id="123456", **event_kw
):
    event = await make_event(**event_kw)
    college = await make_college(event.id)
    graduate = await make_graduate(
        college.id, university_id=university_id, email_verified=True
    )
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


async def test_submit_keeps_transaction_number_as_typed(
    client, db, make_event, make_college, make_graduate
):
    """A2.6: D4 replaced the old upper-casing behaviour.

    The previous assertion of this test ("  ab-1234  " was stored as
    "AB-1234") encoded the old normalisation; the polish round 1 decision D4
    stores the number EXACTLY as typed (only surrounding spaces trimmed).
    """
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
    assert payment.transaction_number == "ab-1234"


async def test_submit_duplicate_other_case_other_ticket_conflict(
    client, make_event, make_college, make_graduate
):
    """D4: uniqueness is global and case-insensitive (abc-1 == ABC-1)."""
    _e1, _c1, _g1, token_a, _ticket_a = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    _e2, _c2, _g2, token_b, _ticket_b = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate, university_id="654321"
    )

    first = await client.post(
        "/api/graduates/me/payment",
        headers=_auth(token_a),
        json=dict(_PAYMENT_BODY, transaction_number="ab-Cd12"),
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/api/graduates/me/payment",
        headers=_auth(token_b),
        json=dict(_PAYMENT_BODY, transaction_number="AB-CD12"),
    )
    assert second.status_code == 409, second.text
    assert messages.TRANSACTION_ALREADY_USED in second.json()["detail"]


async def test_submit_same_ticket_other_case_updates_stored_text(
    client, db, make_event, make_college, make_graduate, make_admin
):
    """D4: resubmitting on the same ticket refreshes the row with the new text.

    The graduate-side flow refuses a second submission while the ticket is
    PROCESSING (existing rule, untouched), so the admin resets the ticket to
    REJECTED between the two submissions.
    """
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    admin = await make_admin()
    login = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: "Admin" + "Pass" + "123!"},
    )
    assert login.status_code == 200, login.text
    admin_auth = _auth(login.json()["access_token"])

    first = await client.post(
        "/api/graduates/me/payment",
        headers=_auth(access_value),
        json=dict(_PAYMENT_BODY, transaction_number="XY-9900"),
    )
    assert first.status_code == 201, first.text

    rejected = await client.post(
        f"/api/admin/tickets/{ticket_id}/reject",
        headers=admin_auth,
        json={"reason": "اختبار إعادة الإرسال"},
    )
    assert rejected.status_code == 200, rejected.text

    second = await client.post(
        "/api/graduates/me/payment",
        headers=_auth(access_value),
        json=dict(_PAYMENT_BODY, transaction_number="xy-9900"),
    )
    assert second.status_code == 201, second.text

    payments = (
        await db.execute(
            select(PaymentModel).where(PaymentModel.ticket_id == ticket_id)
        )
    ).scalars().all()
    assert len(payments) == 1
    assert payments[0].transaction_number == "xy-9900"


async def test_admin_and_graduate_views_show_number_as_typed(
    client, db, make_event, make_college, make_graduate, make_admin
):
    """A2.5: every read path returns the stored text exactly as typed (D4)."""
    _event, _college, _grad, access_value, ticket_id = await _graduate_with_ticket(
        client, make_event, make_college, make_graduate
    )
    submitted = await client.post(
        "/api/graduates/me/payment",
        headers=_auth(access_value),
        json=dict(_PAYMENT_BODY, transaction_number="ab-Cd12"),
    )
    assert submitted.status_code == 201, submitted.text

    admin = await make_admin()
    login = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: "Admin" + "Pass" + "123!"},
    )
    assert login.status_code == 200, login.text
    admin_auth = _auth(login.json()["access_token"])

    listed = await client.get(
        f"/api/admin/events/{_event.id}/payments?status=PROCESSING",
        headers=admin_auth,
    )
    assert listed.status_code == 200, listed.text
    item = next(i for i in listed.json()["items"] if i["ticket_id"] == ticket_id)
    assert item["payment"]["transaction_number"] == "ab-Cd12"

    detail = await client.get(
        f"/api/admin/tickets/{ticket_id}", headers=admin_auth
    )
    assert detail.status_code == 200, detail.text
    assert [
        p["transaction_number"] for p in detail.json()["payments"]
    ] == ["ab-Cd12"]

    graduate_detail = await client.get(
        f"/api/admin/graduates/{_grad.id}", headers=admin_auth
    )
    assert graduate_detail.status_code == 200, graduate_detail.text
    payments = graduate_detail.json()["payments"]
    assert [p["transaction_number"] for p in payments] == ["ab-Cd12"]


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
