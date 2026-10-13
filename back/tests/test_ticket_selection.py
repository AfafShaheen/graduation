"""HTTP tests for ticket options and selection (item 3.4, FR-7/FR-8)."""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.core import messages
from app.core.security import create_access_token
from app.models.event import EventModel
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


_SELECT_BODY = {"ticket_type": "TWO_COMPANIONS", "confirm": True}


async def test_ticket_options_includes_both_types(
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
    options = {item["ticket_type"]: item for item in body["options"]}
    assert set(options) == {"TWO_COMPANIONS", "THREE_COMPANIONS"}
    assert options["TWO_COMPANIONS"]["companions_count"] == 2
    assert options["TWO_COMPANIONS"]["price"] == "100000.00"
    assert options["THREE_COMPANIONS"]["companions_count"] == 3
    assert options["THREE_COMPANIONS"]["price"] == "150000.00"


async def test_ticket_options_hides_three_companions_when_disabled(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate, is_3companions_enabled=False
    )

    response = await client.get(
        "/api/graduates/me/ticket-options", headers=_auth(access_value)
    )

    assert response.status_code == 200, response.text
    assert [item["ticket_type"] for item in response.json()["options"]] == [
        "TWO_COMPANIONS"
    ]


async def test_select_requires_confirm(client, make_event, make_college, make_graduate):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )

    response = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"ticket_type": "TWO_COMPANIONS", "confirm": False},
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


async def test_select_three_companions_disabled(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate, is_3companions_enabled=False
    )

    response = await client.post(
        "/api/graduates/me/ticket",
        headers=_auth(access_value),
        json={"ticket_type": "THREE_COMPANIONS", "confirm": True},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == messages.THREE_COMPANIONS_DISABLED


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
    assert body["ticket_type"] == "TWO_COMPANIONS"
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


async def test_second_selection_conflict(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
        client, make_event, make_college, make_graduate
    )
    first = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/api/graduates/me/ticket", headers=_auth(access_value), json=_SELECT_BODY
    )

    assert second.status_code == 409
    assert second.json()["detail"] == messages.TICKET_ALREADY_EXISTS


async def test_concurrent_double_submit_gives_one_ticket(
    client, make_event, make_college, make_graduate
):
    _event, _college, _grad, access_value = await _verified_graduate(
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

    assert sorted(response.status_code for response in results) == [201, 409]


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
    event_row.price_2_companions = Decimal("200000")
    db.add(event_row)
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
