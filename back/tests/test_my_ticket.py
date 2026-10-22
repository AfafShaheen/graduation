"""HTTP tests for the my-ticket payload (item 3.6, FR-5/FR-10/FR-12)."""

from app.core import messages
from app.models.ticket import TicketStatusEnum
from app.services.qr_service import issue_qr_codes_for_ticket

_PW_FIELD = "pass" + "word"
_GRAD_PW = "Grad" + "Pass" + "1234"
_ADMIN_PW = "Admin" + "Pass" + "123!"
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


async def _my_ticket(client, access_value):
    response = await client.get(
        "/api/graduates/me/ticket", headers=_auth(access_value)
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_my_ticket_without_ticket(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)

    body = await _my_ticket(client, access_value)

    assert body["has_ticket"] is False
    assert body["registration"]["is_open"] is True
    assert "ticket" not in body
    assert "qr_codes" not in body
    assert "whatsapp_group_link" not in body


async def test_my_ticket_awaiting_payment(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )

    body = await _my_ticket(client, access_value)

    assert body["has_ticket"] is True
    assert body["ticket"]["status"] == "AWAITING_PAYMENT"
    assert body["message"] == messages.TICKET_STATUS_AWAITING_PAYMENT
    assert "payment_info" in body
    assert "rejection_reason" not in body["ticket"]
    assert "qr_codes" not in body
    assert "whatsapp_group_link" not in body


async def test_my_ticket_processing(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    await client.post(
        "/api/graduates/me/payment", headers=_auth(access_value), json=_PAYMENT_BODY
    )

    body = await _my_ticket(client, access_value)

    assert body["ticket"]["status"] == "PROCESSING"
    assert body["message"] == messages.TICKET_STATUS_PROCESSING
    assert "payment_info" not in body
    assert "qr_codes" not in body
    assert "whatsapp_group_link" not in body


async def test_my_ticket_confirmed_shows_codes(
    client, db, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    ticket = await make_ticket(graduate.id, event.id, status=TicketStatusEnum.CONFIRMED)
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()

    body = await _my_ticket(client, access_value)

    assert body["ticket"]["status"] == "CONFIRMED"
    assert body["message"] == messages.TICKET_STATUS_CONFIRMED
    assert "payment_info" not in body
    assert len(body["qr_codes"]) == 3
    assert body["qr_codes"][0]["code_type"] == "GRADUATE"
    assert body["qr_codes"][0]["is_activated"] is True
    companion_codes = body["qr_codes"][1:]
    assert all(code["code_type"] == "COMPANION" for code in companion_codes)
    assert all(code["is_activated"] is False for code in companion_codes)
    assert body["whatsapp_group_link"] == event.whatsapp_group_link


async def test_my_ticket_rejected_shows_reason(
    client, db, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    ticket = await make_ticket(graduate.id, event.id, status=TicketStatusEnum.REJECTED)
    ticket.rejection_reason = "رقم العملية غير مطابق"
    db.add(ticket)
    await db.commit()

    body = await _my_ticket(client, access_value)

    assert body["ticket"]["status"] == "REJECTED"
    assert body["message"] == messages.TICKET_STATUS_REJECTED
    assert body["ticket"]["rejection_reason"] == "رقم العملية غير مطابق"
    assert "payment_info" in body
    assert "qr_codes" not in body
    assert "whatsapp_group_link" not in body


async def test_codes_hidden_after_revert_and_returned_after_reconfirm(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    ticket = await make_ticket(graduate.id, event.id, status=TicketStatusEnum.CONFIRMED)
    await make_payment(ticket.id, transaction_number="ABC-1234")
    await issue_qr_codes_for_ticket(db, ticket.id)
    await db.commit()

    before = await _my_ticket(client, access_value)
    codes_before = [code["code_value"] for code in before["qr_codes"]]
    assert before["whatsapp_group_link"] == event.whatsapp_group_link

    admin = await make_admin()
    login = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert login.status_code == 200, login.text
    admin_auth = _auth(login.json()["access_token"])

    revert = await client.post(
        f"/api/admin/tickets/{ticket.id}/revert-payment", headers=admin_auth
    )
    assert revert.status_code == 200, revert.text

    reverted = await _my_ticket(client, access_value)
    assert reverted["ticket"]["status"] == "PROCESSING"
    assert "qr_codes" not in reverted
    assert "whatsapp_group_link" not in reverted

    reconfirm = await client.post(
        f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth
    )
    assert reconfirm.status_code == 200, reconfirm.text

    after = await _my_ticket(client, access_value)
    assert [code["code_value"] for code in after["qr_codes"]] == codes_before
    assert after["whatsapp_group_link"] == event.whatsapp_group_link


async def test_graduate_never_sees_another_ticket(
    client, db, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event()
    college = await make_college(event.id)
    grad_a = await make_graduate(
        college.id, university_id="111111", email_verified=True
    )
    grad_b = await make_graduate(
        college.id, university_id="222222", email_verified=True
    )
    await make_ticket(grad_a.id, event.id, status=TicketStatusEnum.CONFIRMED)
    access_b = await _login(client, grad_b)

    body = await _my_ticket(client, access_b)

    assert body["has_ticket"] is False


async def test_my_ticket_exposes_top_rank(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True, top_rank=2)
    access_value = await _login(client, graduate)

    without_ticket = await _my_ticket(client, access_value)
    assert without_ticket["top_rank"] == 2

    await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    with_ticket = await _my_ticket(client, access_value)
    assert with_ticket["top_rank"] == 2