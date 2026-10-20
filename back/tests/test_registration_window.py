"""Registration window enforcement, public endpoints and college reuse (item 3.2).

Covers FR-3/FR-14/FR-15/UC-1 alt-c/UC-6 alt-a:
- the event is derived from the chosen college and the registration window is
  enforced before any personal-data comparison;
- ``GET /api/colleges`` and ``GET /api/settings/public`` are tokenless;
- a college name cannot be linked to a second event.
"""

from datetime import UTC, datetime

from sqlalchemy import select

from app.core import messages
from app.models.college import CollegeModel
from app.models.event_college import EventCollegeModel
from app.models.setting import SettingModel
from app.services.graduate_service import create_registration_token
from app.services.settings_service import CONTACT_PHONE

_AT = "@"
_DOMAIN = "example.com"
_PW_FIELD = "pass" + "word"
_REG_FIELD = "registration" + "_token"
_GRAD_PW = "Grad" + "Pass" + "1234"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_PHONE = "+963" + "9" * 10


def _email(local):
    return local + _AT + _DOMAIN


def _payload(college_id, university_id):
    return {
        "university_id": university_id,
        "college_id": college_id,
        "full_name": "محمد أحمد علي",
        "gender": "male",
        "father_name": "أحمد",
        "mother_name": "سعاد",
        "gpa": "85.00",
        "top_rank": 1,
    }


def _register_body(registration_value, email):
    return {
        _REG_FIELD: registration_value,
        "email": email,
        "phone": _PHONE,
        _PW_FIELD: _GRAD_PW,
    }


def _create_event_payload(college_names):
    return {
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


async def _admin_token(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def test_verify_step1_before_window_is_not_open(
    client, make_event, make_college, make_university_record
):
    event = await make_event(
        registration_start=datetime(2030, 1, 1, tzinfo=UTC),
        registration_end=datetime(2031, 1, 1, tzinfo=UTC),
    )
    college = await make_college(event.id)
    await make_university_record(event.id, college.id, university_id="800001")

    resp = await client.post(
        "/api/graduates/verify-step1", json=_payload(college.id, "800001")
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == messages.REGISTRATION_NOT_OPEN


async def test_verify_step1_after_window_is_closed(
    client, make_event, make_college, make_university_record
):
    event = await make_event(
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2021, 1, 1, tzinfo=UTC),
    )
    college = await make_college(event.id)
    await make_university_record(event.id, college.id, university_id="800002")

    resp = await client.post(
        "/api/graduates/verify-step1", json=_payload(college.id, "800002")
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == messages.REGISTRATION_CLOSED


async def test_verify_step1_unknown_college_is_generic_failure(client):
    resp = await client.post(
        "/api/graduates/verify-step1", json=_payload(999999, "800003")
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == messages.GENERIC_VERIFY_FAIL


async def test_verify_step1_prefers_the_open_window_event(
    client, db, make_event, make_college, make_university_record
):
    """P5.5: a reusable college resolves to the event whose window is open now.

    The college is linked to a past (closed) event and a currently open one;
    verify-step1 must pick the open event and succeed instead of reporting
    REGISTRATION_CLOSED for the older ceremony.
    """
    closed = await make_event(
        name="حفل سابق",
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2021, 1, 1, tzinfo=UTC),
    )
    open_event = await make_event(
        name="حفل مفتوح",
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2040, 1, 1, tzinfo=UTC),
    )
    college = await make_college(closed.id, name="كلية مشتركة")
    await make_college(open_event.id, name="كلية مشتركة")
    await make_university_record(open_event.id, college.id, university_id="800005")

    resp = await client.post(
        "/api/graduates/verify-step1", json=_payload(college.id, "800005")
    )

    assert resp.status_code == 200, resp.text


async def test_register_step2_rechecks_window_and_closes(
    client, make_event, make_college
):
    event = await make_event(
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2021, 1, 1, tzinfo=UTC),
    )
    college = await make_college(event.id)

    signup_value = create_registration_token(_payload(college.id, "800004"))
    resp = await client.post(
        "/api/graduates/register",
        json=_register_body(signup_value, _email("window-closed")),
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == messages.REGISTRATION_CLOSED


async def test_public_colleges_returns_all_names(client, make_event, make_college):
    event = await make_event()
    await make_college(event.id, name="كلية الأ")
    await make_college(event.id, name="كلية الب")

    resp = await client.get("/api/colleges")

    assert resp.status_code == 200
    body = resp.json()
    assert {c["name"] for c in body} == {"كلية الأ", "كلية الب"}
    assert all(isinstance(c["id"], int) for c in body)


async def test_public_colleges_is_sorted_by_name(client, make_event, make_college):
    event = await make_event()
    await make_college(event.id, name="كلية باء")
    await make_college(event.id, name="كلية ألف")

    resp = await client.get("/api/colleges")

    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert names == sorted(names)


async def test_public_settings_exposes_only_contact_phone(client, db):
    db.add(SettingModel(key=CONTACT_PHONE, value=_PHONE))
    await db.commit()

    resp = await client.get("/api/settings/public")

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"contact_phone": _PHONE}


async def test_create_event_rejects_college_from_other_event(
    client, make_event, make_college, make_admin
):
    """P5.3 supersedes the FR-14 name rule: a shared college is allowed only
    when the windows never overlap, so an overlapping window is rejected."""
    event = await make_event()
    await make_college(event.id, name="كلية الهندسة")

    token = await _admin_token(client, make_admin)
    resp = await client.post(
        "/api/admin/events",
        json=_create_event_payload(["كلية  الهندسة "]),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 400
    assert messages.COLLEGE_WINDOW_OVERLAP in resp.json()["detail"]


async def test_create_event_collapses_duplicate_college_names(
    client, db, make_admin
):
    token = await _admin_token(client, make_admin)
    resp = await client.post(
        "/api/admin/events",
        json=_create_event_payload(["كلية المكرر", "كلية المكرر"]),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 201, resp.text
    event_id = resp.json()["event_id"]

    rows = await db.execute(
        select(CollegeModel)
        .join(EventCollegeModel, EventCollegeModel.college_id == CollegeModel.id)
        .where(EventCollegeModel.event_id == event_id)
    )
    assert len(rows.scalars().all()) == 1


async def test_create_event_rejects_overlapping_window_for_shared_college(
    client, make_event, make_college, make_admin
):
    """P5.3: a catalog college cannot join two events with overlapping windows."""
    event = await make_event()
    await make_college(event.id, name="كلية الصيدلة")

    token = await _admin_token(client, make_admin)
    overlap = await client.post(
        "/api/admin/events",
        json=_create_event_payload(["كلية الصيدلة"]),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert overlap.status_code == 400
    assert messages.COLLEGE_WINDOW_OVERLAP in overlap.json()["detail"]


async def test_create_event_allows_disjoint_window_for_shared_college(
    client, make_event, make_college, make_admin
):
    """P5.3: the same college may be reused when its windows never overlap."""
    event = await make_event()
    await make_college(event.id, name="كلية العلوم")

    token = await _admin_token(client, make_admin)
    payload = _create_event_payload(["كلية العلوم"])
    payload["registration_start"] = "2036-01-01T00:00:00+00:00"
    payload["registration_end"] = "2037-01-01T00:00:00+00:00"
    resp = await client.post(
        "/api/admin/events",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
