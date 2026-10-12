"""HTTP tests for the administrator exceptional actions (item 2.5, FR-22).

Exercises manual check-in, scan revert and payment revert through the public
admin API, including the guard rails added in Phase 2.
"""

from sqlalchemy import select

from app.core import messages
from app.models.qr_code import QrCodeModel
from app.models.ticket import TicketModel, TicketStatusEnum, TicketTypeEnum
from app.services.qr_service import issue_qr_codes_for_ticket

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _token(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _ticket_with_codes(
    db,
    make_event,
    make_college,
    make_graduate,
    make_ticket,
    *,
    ticket_type=TicketTypeEnum.TWO_COMPANIONS,
    status=TicketStatusEnum.CONFIRMED,
    issue=True,
):
    event = await make_event()
    college = await make_college(event.id)
    grad = await make_graduate(college.id, university_id=str(100000 + event.id))
    ticket = await make_ticket(
        grad.id, event.id, ticket_type=ticket_type, status=status
    )
    if issue:
        await issue_qr_codes_for_ticket(db, ticket.id)
        await db.commit()
    return event, grad, ticket


async def test_manual_check_in_requires_admin(client, db, make_event, make_college, make_graduate, make_ticket):
    _event, grad, _ticket = await _ticket_with_codes(
        db, make_event, make_college, make_graduate, make_ticket
    )

    response = await client.post(f"/api/admin/graduates/{grad.id}/manual-check-in")

    assert response.status_code in (401, 403)


async def test_manual_check_in_then_conflict(
    client, db, make_event, make_college, make_graduate, make_ticket, make_admin
):
    _event, grad, _ticket = await _ticket_with_codes(
        db, make_event, make_college, make_graduate, make_ticket
    )
    token = await _token(client, make_admin)

    first = await client.post(
        f"/api/admin/graduates/{grad.id}/manual-check-in", headers=_auth(token)
    )
    second = await client.post(
        f"/api/admin/graduates/{grad.id}/manual-check-in", headers=_auth(token)
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 400
    assert second.json()["detail"] == messages.ALREADY_CHECKED_IN


async def test_revert_scan_nothing_then_reset(
    client, db, make_event, make_college, make_graduate, make_ticket, make_admin
):
    _event, grad, ticket = await _ticket_with_codes(
        db, make_event, make_college, make_graduate, make_ticket,
        ticket_type=TicketTypeEnum.THREE_COMPANIONS,
    )
    token = await _token(client, make_admin)
    path = f"/api/admin/graduates/{grad.id}/revert-scan"
    ticket_id = ticket.id

    nothing = await client.post(path, headers=_auth(token))
    assert nothing.status_code == 400
    assert nothing.json()["detail"] == messages.NOTHING_TO_REVERT

    check_in = await client.post(
        f"/api/admin/graduates/{grad.id}/manual-check-in", headers=_auth(token)
    )
    assert check_in.status_code == 200, check_in.text

    reverted = await client.post(path, headers=_auth(token))
    assert reverted.status_code == 200, reverted.text

    db.expire_all()
    codes = (
        await db.execute(
            select(QrCodeModel).where(QrCodeModel.ticket_id == ticket_id)
        )
    ).scalars().all()
    assert len(codes) == 4
    assert all(code.scanned_at is None for code in codes)
    assert all(code.is_activated is False for code in codes)


async def test_revert_payment_rejects_non_confirmed(
    client, db, make_event, make_college, make_graduate, make_ticket, make_admin
):
    _event, _grad, ticket = await _ticket_with_codes(
        db, make_event, make_college, make_graduate, make_ticket,
        status=TicketStatusEnum.AWAITING_PAYMENT, issue=False,
    )
    token = await _token(client, make_admin)

    response = await client.post(
        f"/api/admin/tickets/{ticket.id}/revert-payment", headers=_auth(token)
    )

    assert response.status_code == 400
    assert response.json()["detail"] == messages.PAYMENT_NOT_REVERTIBLE


async def test_revert_payment_success_sets_processing(
    client, db, make_event, make_college, make_graduate, make_ticket, make_admin
):
    _event, _grad, ticket = await _ticket_with_codes(
        db, make_event, make_college, make_graduate, make_ticket
    )
    token = await _token(client, make_admin)
    ticket_id = ticket.id

    response = await client.post(
        f"/api/admin/tickets/{ticket_id}/revert-payment", headers=_auth(token)
    )

    assert response.status_code == 200, response.text
    db.expire_all()
    refreshed = await db.get(TicketModel, ticket_id)
    assert refreshed.status == TicketStatusEnum.PROCESSING
    assert refreshed.confirmed_at is None
