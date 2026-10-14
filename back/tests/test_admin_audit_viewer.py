"""HTTP-level tests for the admin audit-log viewer (item 3.5.2, D22)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.security import create_access_token
from app.models.audit_log import AuditLogModel
from app.services.audit_log import ActorType, record_audit

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_AT = "@"
_DOMAIN = "example.com"
_PATH = "/api/admin/audit-logs"


def _auth(value):
    return {"Authorization": f"Bearer {value}"}


async def _login(client, admin):
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200
    return _auth(response.json()["access_token"])


async def _audit(db, actor_type, actor_id, action, *, target="t", details=None, **refs):
    await record_audit(
        db, actor_type, actor_id, action, target, details, **refs
    )
    await db.commit()


async def test_requires_admin(client, db, make_admin):
    admin = await make_admin()
    graduate_value = create_access_token(
        {
            "sub": "1",
            "graduate_id": 1,
            "role": "graduate",
            "email": "grad1" + _AT + _DOMAIN,
            "university_id": "1",
        }
    )
    scanner_value = create_access_token(
        {"sub": "1", "scanner_id": 1, "role": "scanner", "event_id": 1}
    )

    assert (await client.get(_PATH)).status_code in (401, 403)
    assert (
        await client.get(_PATH, headers=_auth(graduate_value))
    ).status_code in (401, 403)
    assert (
        await client.get(_PATH, headers=_auth(scanner_value))
    ).status_code in (401, 403)


async def test_defaults_exclude_scans_and_include_scans_restores(
    client, db, make_admin, make_scanner, make_event
):
    admin = await make_admin()
    event = await make_event()
    scanner = await make_scanner(admin.id, event.id)
    await _audit(db, ActorType.ADMIN, admin.id, "CREATE_EVENT", event_id=event.id)
    await _audit(db, ActorType.SCANNER, scanner.id, "qr_scanned", event_id=event.id)

    headers = await _login(client, admin)

    default = await client.get(_PATH, headers=headers)
    assert default.status_code == 200
    body = default.json()
    assert body["total"] == 1
    assert body["items"][0]["action"] == "CREATE_EVENT"
    assert body["items"][0]["action_label"] == "إنشاء حفل"

    with_scans = await client.get(
        f"{_PATH}?include_scans=true", headers=headers
    )
    assert with_scans.status_code == 200
    actions = {item["action"] for item in with_scans.json()["items"]}
    assert actions == {"CREATE_EVENT", "qr_scanned"}


async def test_exceptional_only(client, db, make_admin):
    admin = await make_admin()
    await _audit(db, ActorType.ADMIN, admin.id, "CREATE_EVENT")
    await _audit(db, ActorType.ADMIN, admin.id, "MANUAL_CHECK_IN")
    await _audit(db, ActorType.ADMIN, admin.id, "UPDATE_EMAIL")
    await _audit(db, ActorType.ADMIN, admin.id, "SETTINGS_UPDATED")

    headers = await _login(client, admin)
    response = await client.get(f"{_PATH}?exceptional_only=true", headers=headers)

    assert response.status_code == 200
    actions = {item["action"] for item in response.json()["items"]}
    assert actions == {"MANUAL_CHECK_IN", "UPDATE_EMAIL"}


async def test_actor_type_filter(client, db, make_admin, make_scanner, make_event):
    admin = await make_admin()
    event = await make_event()
    scanner = await make_scanner(admin.id, event.id)
    await _audit(db, ActorType.ADMIN, admin.id, "CREATE_EVENT")
    await _audit(db, ActorType.SCANNER, scanner.id, "SCAN_NOTE")

    headers = await _login(client, admin)

    only_admin = await client.get(f"{_PATH}?actor_type=ADMIN", headers=headers)
    assert {i["action"] for i in only_admin.json()["items"]} == {"CREATE_EVENT"}

    only_scanner = await client.get(f"{_PATH}?actor_type=SCANNER", headers=headers)
    assert {i["action"] for i in only_scanner.json()["items"]} == {"SCAN_NOTE"}


async def test_ref_and_action_filters(
    client, db, make_admin, make_event, make_college, make_graduate, make_ticket
):
    admin = await make_admin()
    event = await make_event()
    other_event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id)
    ticket = await make_ticket(graduate.id, event.id)

    await _audit(
        db, ActorType.ADMIN, admin.id, "PAYMENT_CONFIRMED",
        event_id=event.id, graduate_id=graduate.id, ticket_id=ticket.id,
    )
    await _audit(db, ActorType.ADMIN, admin.id, "CREATE_EVENT", event_id=other_event.id)

    headers = await _login(client, admin)

    by_event = await client.get(f"{_PATH}?event_id={event.id}", headers=headers)
    assert {i["action"] for i in by_event.json()["items"]} == {"PAYMENT_CONFIRMED"}

    by_graduate = await client.get(
        f"{_PATH}?graduate_id={graduate.id}", headers=headers
    )
    assert {i["action"] for i in by_graduate.json()["items"]} == {"PAYMENT_CONFIRMED"}

    by_ticket = await client.get(f"{_PATH}?ticket_id={ticket.id}", headers=headers)
    assert {i["action"] for i in by_ticket.json()["items"]} == {"PAYMENT_CONFIRMED"}

    by_action = await client.get(
        f"{_PATH}?action=CREATE_EVENT&action=PAYMENT_CONFIRMED", headers=headers
    )
    assert {i["action"] for i in by_action.json()["items"]} == {
        "CREATE_EVENT",
        "PAYMENT_CONFIRMED",
    }


async def test_date_range_is_inclusive(client, db, make_admin):
    admin = await make_admin()
    await _audit(db, ActorType.ADMIN, admin.id, "CREATE_EVENT")
    await _audit(db, ActorType.ADMIN, admin.id, "UPDATE_EVENT")

    headers = await _login(client, admin)
    rows = (
        await db.execute(select(AuditLogModel).order_by(AuditLogModel.id))
    ).scalars().all()
    newest_at = rows[-1].created_at.isoformat()

    exact = await client.get(
        _PATH, params={"date_from": newest_at, "date_to": newest_at}, headers=headers
    )
    assert exact.status_code == 200
    assert {i["action"] for i in exact.json()["items"]} == {"UPDATE_EVENT"}

    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    empty = await client.get(
        _PATH, params={"date_from": future}, headers=headers
    )
    assert empty.json()["total"] == 0

    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    allrows = await client.get(
        _PATH, params={"date_from": past}, headers=headers
    )
    assert allrows.json()["total"] == 2


async def test_pagination_and_ordering(client, db, make_admin):
    admin = await make_admin()
    for _ in range(5):
        await _audit(db, ActorType.ADMIN, admin.id, "CREATE_EVENT")

    headers = await _login(client, admin)

    page_one = await client.get(f"{_PATH}?limit=2&offset=0", headers=headers)
    page_two = await client.get(f"{_PATH}?limit=2&offset=2", headers=headers)

    one_ids = [i["id"] for i in page_one.json()["items"]]
    two_ids = [i["id"] for i in page_two.json()["items"]]
    assert page_one.json()["total"] == 5
    assert len(one_ids) == 2 and len(two_ids) == 2
    # newest first, and pages do not overlap
    assert one_ids == sorted(one_ids, reverse=True)
    assert set(one_ids).isdisjoint(two_ids)
    assert min(one_ids) > max(two_ids)


async def test_q_escapes_like_wildcards(
    client, db, make_admin, make_event, make_college, make_graduate
):
    admin = await make_admin()
    event = await make_event()
    college = await make_college(event.id)
    literal = await make_graduate(
        college.id, university_id="A_1", full_name="طالب ألف"
    )
    other = await make_graduate(college.id, university_id="AX1", full_name="طالب باء")
    percent = await make_graduate(
        college.id, university_id="P1", full_name="100% تخرج"
    )
    percent_other = await make_graduate(
        college.id, university_id="P2", full_name="100X تخرج"
    )

    for grad in (literal, other, percent, percent_other):
        await _audit(
            db, ActorType.ADMIN, admin.id, "UPDATE_EMAIL", graduate_id=grad.id
        )

    headers = await _login(client, admin)

    underscore = await client.get(f"{_PATH}?q=A_1", headers=headers)
    assert underscore.json()["total"] == 1
    assert underscore.json()["items"][0]["graduate"]["id"] == literal.id

    pct = await client.get(f"{_PATH}?q=100%25", headers=headers)
    assert pct.json()["total"] == 1
    assert pct.json()["items"][0]["graduate"]["id"] == percent.id


async def test_actor_username_resolved_and_deleted_graduate_is_null(
    client, db, make_admin, make_scanner, make_event, make_college, make_graduate
):
    admin = await make_admin()
    event = await make_event()
    scanner = await make_scanner(admin.id, event.id)
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, university_id="9001")

    await _audit(db, ActorType.ADMIN, admin.id, "CREATE_EVENT")
    await _audit(db, ActorType.SCANNER, scanner.id, "SCAN_NOTE")
    await _audit(
        db, ActorType.ADMIN, 999999, "DELETE_EVENT", graduate_id=graduate.id
    )

    await db.delete(graduate)
    await db.commit()

    headers = await _login(client, admin)
    response = await client.get(_PATH, headers=headers)
    assert response.status_code == 200

    by_action = {i["action"]: i for i in response.json()["items"]}

    assert by_action["CREATE_EVENT"]["actor"]["username"] == admin.username
    assert by_action["CREATE_EVENT"]["actor"]["role_label"] == "مسؤول الاتحاد"
    assert by_action["SCAN_NOTE"]["actor"]["username"] == scanner.username
    assert by_action["SCAN_NOTE"]["actor"]["role_label"] == "ماسح"

    deleted = by_action["DELETE_EVENT"]
    assert deleted["actor"]["username"] is None
    assert deleted["graduate"] is None


async def test_unknown_action_label_falls_back_to_code(client, db, make_admin):
    admin = await make_admin()
    await _audit(db, ActorType.ADMIN, admin.id, "SOME_FUTURE_ACTION")

    headers = await _login(client, admin)
    response = await client.get(_PATH, headers=headers)
    item = response.json()["items"][0]
    assert item["action"] == "SOME_FUTURE_ACTION"
    assert item["action_label"] == "SOME_FUTURE_ACTION"


async def test_invalid_params_return_422(client, db, make_admin):
    admin = await make_admin()
    headers = await _login(client, admin)

    assert (
        await client.get(f"{_PATH}?actor_type=ROBOT", headers=headers)
    ).status_code == 422
    assert (
        await client.get(f"{_PATH}?date_from=not-a-date", headers=headers)
    ).status_code == 422
    assert (
        await client.get(f"{_PATH}?limit=0", headers=headers)
    ).status_code == 422
    assert (
        await client.get(f"{_PATH}?limit=201", headers=headers)
    ).status_code == 422
