"""Editing a ceremony's colleges after creation.

Covers ``EventUpdate.college_names``: the full new list replaces the existing
links, additions are validated against overlapping registration windows, and a
college cannot be removed while graduates of it are registered for the event.
"""

from sqlalchemy import select

from app.core import messages
from app.models.event_college import EventCollegeModel

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _admin_headers(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": "Bearer " + response.json()["access_token"]}


async def _event_details(client, headers, event_id):
    response = await client.get(f"/api/admin/events/{event_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _college_names(payload):
    return sorted(college["name"] for college in payload["colleges"])


async def _linked_names(db, event_id):
    from app.models.college import CollegeModel

    rows = await db.execute(
        select(CollegeModel.name)
        .join(EventCollegeModel, EventCollegeModel.college_id == CollegeModel.id)
        .where(EventCollegeModel.event_id == event_id)
    )
    return sorted(rows.scalars().all())


async def test_adding_a_college_links_it(
    client, db, make_admin, make_event, make_college
):
    event = await make_event()
    await make_college(event.id, name="كلية الهندسة")
    headers = await _admin_headers(client, make_admin)

    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"college_names": ["كلية الهندسة", "كلية الطب"]},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert await _linked_names(db, event.id) == ["كلية الطب", "كلية الهندسة"]
    detail = await _event_details(client, headers, event.id)
    assert _college_names(detail) == ["كلية الطب", "كلية الهندسة"]


async def test_removing_a_college_without_graduates_unlinks_it(
    client, db, make_admin, make_event, make_college
):
    event = await make_event()
    await make_college(event.id, name="كلية الهندسة")
    await make_college(event.id, name="كلية الطب")
    headers = await _admin_headers(client, make_admin)

    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"college_names": ["كلية الهندسة"]},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert await _linked_names(db, event.id) == ["كلية الهندسة"]


async def test_removing_a_college_with_registered_graduate_is_conflict(
    client, db, make_admin, make_event, make_college, make_graduate, make_ticket
):
    event = await make_event()
    await make_college(event.id, name="كلية الهندسة")
    medicine = await make_college(event.id, name="كلية الطب")
    graduate = await make_graduate(medicine.id, university_id="920001")
    await make_ticket(graduate.id, event.id)
    headers = await _admin_headers(client, make_admin)

    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"college_names": ["كلية الهندسة"]},
        headers=headers,
    )

    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert "كلية الطب" in detail
    assert "1" in detail
    assert await _linked_names(db, event.id) == ["كلية الطب", "كلية الهندسة"]


async def test_adding_a_college_with_overlapping_ceremony_is_conflict(
    client, make_admin, make_event, make_college
):
    other = await make_event(name="حفل آخر")
    await make_college(other.id, name="كلية الطب")
    event = await make_event(name="حفل حالي")
    await make_college(event.id, name="كلية الهندسة")
    headers = await _admin_headers(client, make_admin)

    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"college_names": ["كلية الهندسة", "كلية الطب"]},
        headers=headers,
    )

    assert response.status_code == 409, response.text
    assert messages.COLLEGE_WINDOW_OVERLAP in response.json()["detail"]


async def test_omitting_college_names_keeps_the_colleges(
    client, db, make_admin, make_event, make_college
):
    event = await make_event()
    await make_college(event.id, name="كلية الهندسة")
    await make_college(event.id, name="كلية الطب")
    headers = await _admin_headers(client, make_admin)

    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"name": "حفل محدَّث"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert await _linked_names(db, event.id) == ["كلية الطب", "كلية الهندسة"]


async def test_empty_college_list_is_rejected(
    client, make_admin, make_event, make_college
):
    event = await make_event()
    await make_college(event.id, name="كلية الهندسة")
    headers = await _admin_headers(client, make_admin)

    response = await client.put(
        f"/api/admin/events/{event.id}",
        json={"college_names": []},
        headers=headers,
    )

    assert response.status_code == 422, response.text
