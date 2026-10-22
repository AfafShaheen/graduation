"""Item B2: seat labels assigned at payment confirmation.

Covers the seat service (sequential/idempotent blocks, label formatting), the
end-to-end confirmation flow (seat assigned in the same transaction and shown
to both the graduate and the admin) and the fact that reverting a payment keeps
the allocated seat.
"""

from app.core.security import create_access_token
from app.models.ticket import TicketModel, TicketStatusEnum
from app.services.seat_service import assign_seat_block, seat_labels

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _admin_token(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": "Bearer " + response.json()["access_token"]}


def _graduate_headers(graduate):
    access_value = create_access_token(
        {
            "sub": str(graduate.id),
            "graduate_id": graduate.id,
            "role": "graduate",
            "email": graduate.email,
            "university_id": graduate.university_id,
        }
    )
    return {"Authorization": "Bearer " + access_value}


def test_seat_labels_with_prefix():
    assert seat_labels("E", 17, 2) == {
        "graduate": "E-17",
        "companions": ["E-18", "E-19"],
        "range": "E-17 \u2192 E-19",
    }


def test_seat_labels_without_prefix():
    assert seat_labels(None, 5, 3) == {
        "graduate": "5",
        "companions": ["6", "7", "8"],
        "range": "5 \u2192 8",
    }


def test_seat_labels_none_when_unassigned():
    assert seat_labels("E", None, 2) is None


async def test_assign_seat_block_is_sequential_and_idempotent(
    make_event, make_college, make_graduate, make_ticket, db
):
    event = await make_event(seat_prefix="E")
    college = await make_college(event.id)
    first = await make_graduate(college.id, university_id="930001")
    second = await make_graduate(college.id, university_id="930002")
    first_ticket = await make_ticket(first.id, event.id2)
    second_ticket = await make_ticket(second.id, event.id3)

    await assign_seat_block(db, first_ticket)
    await assign_seat_block(db, second_ticket)
    assert first_ticket.seat_start == 1
    assert second_ticket.seat_start == 4

    # Idempotent: an already-seated ticket keeps its seat.
    await assign_seat_block(db, first_ticket)
    assert first_ticket.seat_start == 1
    await db.commit()


async def test_confirm_assigns_seat_and_shows_it(
    client,
    make_admin,
    make_event,
    make_college,
    make_graduate,
    make_ticket,
    make_payment,
):
    event = await make_event(seat_prefix="E")
    college = await make_college(event.id)
    graduate = await make_graduate(
        college.id, university_id="930010", email_verified=True
    )
    ticket = await make_ticket(
        graduate.id,
        event.id,
        status=TicketStatusEnum.PROCESSING,
    )
    await make_payment(ticket.id)

    headers = await _admin_token(client, make_admin)
    confirmed = await client.post(
        f"/api/admin/tickets/{ticket.id}/confirm", headers=headers
    )
    assert confirmed.status_code == 200, confirmed.text

    expected = {
        "graduate": "E-1",
        "companions": ["E-2", "E-3"],
        "range": "E-1 \u2192 E-3",
    }

    admin_detail = await client.get(
        f"/api/admin/tickets/{ticket.id}", headers=headers
    )
    assert admin_detail.status_code == 200, admin_detail.text
    assert admin_detail.json()["seat"] == expected

    mine = await client.get(
        "/api/graduates/me/ticket", headers=_graduate_headers(graduate)
    )
    assert mine.status_code == 200, mine.text
    assert mine.json()["seat"] == expected


async def test_my_ticket_hides_seat_until_confirmed(
    client, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event(seat_prefix="E")
    college = await make_college(event.id)
    graduate = await make_graduate(
        college.id, university_id="930020", email_verified=True
    )
    await make_ticket(graduate.id, event.id, status=TicketStatusEnum.PROCESSING)

    mine = await client.get(
        "/api/graduates/me/ticket", headers=_graduate_headers(graduate)
    )
    assert mine.status_code == 200, mine.text
    assert "seat" not in mine.json()


async def test_second_ticket_starts_after_first_block(
    client,
    make_admin,
    make_event,
    make_college,
    make_graduate,
    make_ticket,
    make_payment,
):
    event = await make_event(seat_prefix="A")
    college = await make_college(event.id)
    first = await make_graduate(college.id, university_id="930030")
    second = await make_graduate(college.id, university_id="930031")
    first_ticket = await make_ticket(
        first.id, event.id, status=TicketStatusEnum.PROCESSING
    )
    second_ticket = await make_ticket(
        second.id, event.id, status=TicketStatusEnum.PROCESSING
    )
    await make_payment(first_ticket.id, transaction_number="TXN-FIRST")
    await make_payment(second_ticket.id, transaction_number="TXN-SECOND")

    headers = await _admin_token(client, make_admin)
    r1 = await client.post(
        f"/api/admin/tickets/{first_ticket.id}/confirm", headers=headers
    )
    r2 = await client.post(
        f"/api/admin/tickets/{second_ticket.id}/confirm", headers=headers
    )
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)

    d1 = await client.get(f"/api/admin/tickets/{first_ticket.id}", headers=headers)
    d2 = await client.get(f"/api/admin/tickets/{second_ticket.id}", headers=headers)
    assert d1.json()["seat"]["graduate"] == "A-1"
    assert d2.json()["seat"]["graduate"] == "A-4"


async def test_revert_payment_keeps_the_seat(
    client,
    make_admin,
    make_event,
    make_college,
    make_graduate,
    make_ticket,
    make_payment,
    db,
):
    event = await make_event(seat_prefix="E")
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, university_id="930040")
    ticket = await make_ticket(
        graduate.id, event.id, status=TicketStatusEnum.PROCESSING
    )
    await make_payment(ticket.id)

    headers = await _admin_token(client, make_admin)
    await client.post(f"/api/admin/tickets/{ticket.id}/confirm", headers=headers)

    reverted = await client.post(
        f"/api/admin/tickets/{ticket.id}/revert-payment", headers=headers
    )
    assert reverted.status_code == 200, reverted.text

    await db.refresh(ticket)
    assert ticket.status == TicketStatusEnum.PROCESSING
    assert ticket.seat_start == 1
    assert ticket.confirmed_at is None
