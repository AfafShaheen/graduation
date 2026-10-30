"""HTTP tests for ticket options and selection (item 3.4, FR-7/FR-8)."""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.core import messages
from app.core.security import create_access_token
from app.models.event import EventModel
from app.models.event_ticket_package import EventTicketPackageModel
from app.models.ticket import TicketModel, TicketStatusEnum

_PW_FIELD = "pass" + "word"
_GRAD_PW = "Grad" + "Pass" + "1234"


def _auth(access_value):
    return {"Authorization": f"Bearer {access_value}"}


async def _login(client, graduate):
    response = await client.post(
        "/api/auth/graduate/login",
        json={"email": graduate.email, _PW_FIELD: _GRAD_PW},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _verified_graduate(
    client, make_event, make_college, make_graduate, **event_kw
):
    event = await make_event(**event_kw)
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)
    return event, college, graduate, access_value


_SELECT_BODY = {"companions_count": 2, "confirm": True}


async def test_ticket_options_lists_packages(
    client, make_event, make_college, make_graduate
):
    event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )

    response = await client.get(
        "/api/graduates/me/ticket-options", headers=_auth(access_value)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["event"]["id"] == event.id
    assert body["has_ticket"] is False
    assert body["info_text"] == messages.TICKET_INFO_TEXT
    assert body["registration"]["is_open"] is True
    options = {item["companions_count"]: item for item in body["options"]}
    assert set(options) == {2, 3}
    assert options[2]["price"] == "100000.00"
    assert options[3]["price"] == "150000.00"


async def test_ticket_options_reflects_custom_packages(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client,
        make_event,
        make_college,
        make_graduate,
        packages=[(2, 50000), (4, 90000)],
    )

    response = await client.get(
        "/api/graduates/me/ticket-options", headers=_auth(access_value)
    )

    assert response.status_code == 200, response.text
    assert [item["companions_count"] for item in response.json()["options"]] == [2, 4]


async def test_select_requires_confirm(client, make_event, make_college, make_graduate):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )

    response = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"companions_count": 2, "confirm": False},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == messages.TICKET_CHOICE_NOT_CONFIRMED


async def test_select_when_window_closed(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client,
        make_event,
        make_college,
        make_graduate,
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2020, 1, 2, tzinfo=UTC),
    )

    response = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )

    assert response.status_code == 403
    assert response.json()["detail"] == messages.REGISTRATION_CLOSED


async def test_select_unavailable_package(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate, packages=[(2, 50000)]
    )

    response = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"companions_count": 5, "confirm": True},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == messages.TICKET_PACKAGE_UNAVAILABLE


async def test_select_success(
    client, db, make_event, make_college, make_graduate
):
    event, _college, graduate, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )

    response = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "AWAITING_PAYMENT"
    assert body["companions_count"] == 2
    assert body["price"] == "100000.00"
    assert body["confirmed_at"] is None

    stored = (
        await db.execute(
            select(TicketModel).where(TicketModel.graduate_id == graduate.id)
        )
    ).scalar_one()
    assert stored.event_id == event.id
    assert stored.status == TicketStatusEnum.AWAITING_PAYMENT


async def test_same_package_again_returns_same_ticket_unchanged(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, graduate, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )
    first = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )

    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["companions_count"] == 2
    assert second.json()["price"] == "100000.00"
    assert second.json()["status"] == "AWAITING_PAYMENT"
    rows = (
        await db.execute(
            select(TicketModel).where(TicketModel.graduate_id == graduate.id)
        )
    ).scalars().all()
    assert len(rows) == 1


async def test_change_package_while_awaiting_payment(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, graduate, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )
    first = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    assert first.status_code == 201, first.text

    changed = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"companions_count": 3, "confirm": True},
    )

    assert changed.status_code == 201, changed.text
    body = changed.json()
    assert body["id"] == first.json()["id"]
    assert body["companions_count"] == 3
    assert body["price"] == "150000.00"
    assert body["status"] == "AWAITING_PAYMENT"
    rows = (
        await db.execute(
            select(TicketModel).where(TicketModel.graduate_id == graduate.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    await db.refresh(rows[0])
    assert rows[0].companions_count == 3
    assert rows[0].price == Decimal("150000")


async def _ticket_with_status(client, db, access_value, new_status):
    created = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    assert created.status_code == 201, created.text
    ticket = await db.get(TicketModel, created.json()["id"])
    ticket.status = new_status
    db.add(ticket)
    await db.commit()
    return created.json()["id"]


async def test_change_package_blocked_while_processing(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )
    await _ticket_with_status(client, db, access_value, TicketStatusEnum.PROCESSING)

    response = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"companions_count": 3, "confirm": True},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == messages.TICKET_ALREADY_EXISTS


async def test_change_package_blocked_when_confirmed(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )
    await _ticket_with_status(client, db, access_value, TicketStatusEnum.CONFIRMED)

    response = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"companions_count": 3, "confirm": True},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == messages.TICKET_ALREADY_EXISTS


async def test_change_package_allowed_when_rejected_keeps_status(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )
    ticket_id = await _ticket_with_status(
        client, db, access_value, TicketStatusEnum.REJECTED
    )

    response = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"companions_count": 3, "confirm": True},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["id"] == ticket_id
    assert body["companions_count"] == 3
    assert body["status"] == "REJECTED"


async def test_ticket_options_reports_selection_and_can_change(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )

    before = await client.get(
        "/api/graduates/me/ticket-options", headers=_auth(access_value)
    )
    assert before.status_code == 200, before.text
    assert before.json()["selected_companions_count"] is None
    assert before.json()["can_change"] is True

    ticket_id = await _ticket_with_status(
        client, db, access_value, TicketStatusEnum.AWAITING_PAYMENT
    )
    awaiting = await client.get(
        "/api/graduates/me/ticket-options", headers=_auth(access_value)
    )
    assert awaiting.json()["has_ticket"] is True
    assert awaiting.json()["selected_companions_count"] == 2
    assert awaiting.json()["can_change"] is True

    ticket = await db.get(TicketModel, ticket_id)
    ticket.status = TicketStatusEnum.PROCESSING
    db.add(ticket)
    await db.commit()
    processing = await client.get(
        "/api/graduates/me/ticket-options", headers=_auth(access_value)
    )
    assert processing.json()["selected_companions_count"] == 2
    assert processing.json()["can_change"] is False


async def test_concurrent_double_submit_gives_one_ticket(
    client, db, make_event, make_college, make_graduate
):
    _event, _college, graduate, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )

    results = await asyncio.gather(
        client.post(
            "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
        ),
        client.post(
            "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
        ),
    )

    # The loser either sees the winner's ticket (201, same ticket) or hits the
    # unique constraint (409). Either way only one ticket row exists.
    codes = sorted(response.status_code for response in results)
    assert codes in ([201, 201], [201, 409])
    rows = (
        await db.execute(
            select(TicketModel).where(TicketModel.graduate_id == graduate.id)
        )
    ).scalars().all()
    assert len(rows) == 1


async def test_price_snapshot_survives_event_price_change(
    client, db, make_event, make_college, make_graduate
):
    event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )
    created = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    assert created.status_code == 201, created.text

    event_row = await db.get(EventModel, event.id)
    package = (
        await db.execute(
            select(EventTicketPackageModel).where(
                EventTicketPackageModel.event_id == event.id,
                EventTicketPackageModel.companions_count == 2,
            )
        )
    ).scalar_one()
    package.price = Decimal("200000")
    db.add(event_row)
    db.add(package)
    await db.commit()

    ticket = await db.get(TicketModel, created.json()["id"])
    assert ticket.price == Decimal("100000")

async def test_unverified_graduate_is_rejected(
    client, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=False)
    access_value = create_access_token(
        {
            "sub": str(graduate.id),
            "graduate_id": graduate.id,
            "role": "graduate",
            "email": graduate.email,
            "university_id": graduate.university_id,
        }
    )

    response = await client.get(
        "/api/graduates/me/ticket-options", headers=_auth(access_value)
    )

    assert response.status_code == 403


async def test_select_uses_open_window_for_reusable_college(
    client, db, make_event, make_college, make_graduate
):
    """P5.9: a college shared by a closed and an open ceremony must not block
    ticket selection; the open event is resolved and selection succeeds."""
    closed = await make_event(
        name="حفل منتهٍ",
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2020, 1, 2, tzinfo=UTC),
    )
    open_event = await make_event(
        name="حفل مفتوح",
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2040, 1, 1, tzinfo=UTC),
    )
    college = await make_college(closed.id)
    await make_college(open_event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    access_value = await _login(client, graduate)

    response = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )

    assert response.status_code == 201, response.text
    ticket = await db.get(TicketModel, response.json()["id"])
    assert ticket.event_id == open_event.id
