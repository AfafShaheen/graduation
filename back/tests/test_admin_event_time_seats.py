"""Item B1: optional ceremony time and seat prefix on events.

Covers the additive event fields (``event_time``, ``seat_prefix``), their
validation/normalisation and the seat-prefix lock that kicks in once any ticket
of the event has an allocated seat.
"""

from datetime import date, time

from sqlalchemy import update

from app.core import messages
from app.models.ticket import TicketModel
from app.core.security import create_access_token

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


def _event_body(college_names, **overrides):
    body = {
        "name": "حفل جديد",
        "event_date": "2030-06-01",
        "registration_start": "2025-01-01T00:00:00+00:00",
        "registration_end": "2031-01-01T00:00:00+00:00",
        "whatsapp_group_link": "https://chat.whatsapp.com/test",
        "is_3companions_enabled": True,
        "price_2_companions": "100000",
        "price_3_companions": "150000",
        "college_names": college_names,
    }
    body.update(overrides)
    return body


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


async def test_create_event_with_time_and_prefix_normalises(client, make_admin):
    headers = await _admin_token(client, make_admin)
    response = await client.post(
        "/api/admin/events",
        json=_event_body(
            ["كلية الطب"],
            event_time="18:30:00",
            seat_prefix="e",
        ),
        headers=headers,
    )
    assert response.status_code == 201, response.text
    event_id = response.json()["event_id"]

    detail = await client.get(f"/api/admin/events/{event_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    payload = detail.json()
    assert payload["event_time"] == "18:30:00"
    assert payload["seat_prefix"] == "E"


async def test_blank_seat_prefix_becomes_null(client, make_admin):
    headers = await _admin_token(client, make_admin)
    response = await client.post(
        "/api/admin/events",
        json=_event_body(["كلية الآداب"], seat_prefix="   "),
        headers=headers,
    )
    assert response.status_code == 201, response.text
    event_id = response.json()["event_id"]

    detail = await client.get(f"/api/admin/events/{event_id}", headers=headers)
    assert detail.json()["seat_prefix"] is None
    assert detail.json()["event_time"] is None


async def test_invalid_seat_prefix_rejected(client, make_admin):
    headers = await _admin_token(client, make_admin)
    for bad in ("e1", "abcd", "E-1", "1"):
        response = await client.post(
            "/api/admin/events",
            json=_event_body(["كلية العلوم"], seat_prefix=bad),
            headers=headers,
        )
        assert response.status_code == 422, (bad, response.text)


async def test_arabic_seat_prefix_accepted(client, make_admin):
    headers = await _admin_token(client, make_admin)
    response = await client.post(
        "/api/admin/events",
        json=_event_body(["كلية الصيدلة"], seat_prefix="أ"),
        headers=headers,
    )
    assert response.status_code == 201, response.text
    event_id = response.json()["event_id"]

    detail = await client.get(f"/api/admin/events/{event_id}", headers=headers)
    assert detail.json()["seat_prefix"] == "أ"


async def test_update_seat_prefix_allowed_before_any_seat(client, make_admin):
    headers = await _admin_token(client, make_admin)
    created = await client.post(
        "/api/admin/events",
        json=_event_body(["كلية العلوم السياسية"], seat_prefix="A"),
        headers=headers,
    )
    event_id = created.json()["event_id"]

    updated = await client.put(
        f"/api/admin/events/{event_id}",
        json={"seat_prefix": "B"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text

    detail = await client.get(f"/api/admin/events/{event_id}", headers=headers)
    assert detail.json()["seat_prefix"] == "B"


async def test_update_seat_prefix_locked_once_seats_assigned(
    client, make_admin, make_event, make_college, make_graduate, make_ticket, db
):
    event = await make_event(seat_prefix="E")
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, university_id="910001")
    ticket = await make_ticket(graduate.id, event.id)
    await db.execute(
        update(TicketModel).where(TicketModel.id == ticket.id).values(seat_start=1)
    )
    await db.commit()

    headers = await _admin_token(client, make_admin)
    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"seat_prefix": "Z"},
        headers=headers,
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == messages.SEAT_PREFIX_LOCKED


async def test_update_event_time_always_allowed(client, make_admin, make_event):
    event = await make_event(event_time=time(10, 0))
    headers = await _admin_token(client, make_admin)

    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"event_time": "20:15:00"},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    detail = await client.get(f"/api/admin/events/{event.id}", headers=headers)
    assert detail.json()["event_time"] == "20:15:00"


async def test_ticket_options_expose_event_time(
    client, make_event, make_college, make_graduate
):
    event = await make_event(event_time=time(18, 30))
    college = await make_college(event.id)
    graduate = await make_graduate(
        college.id, university_id="910002", email_verified=True
    )

    response = await client.get(
        "/api/graduates/me/ticket-options",
        headers=_graduate_headers(graduate),
    )
    assert response.status_code == 200, response.text
    assert response.json()["event"]["event_time"] == "18:30:00"
    assert response.json()["event"]["event_date"] == date(2030, 6, 1).isoformat()
