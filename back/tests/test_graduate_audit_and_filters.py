"""What a graduate does is written to the audit log, and the log can be filtered."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core import messages
from app.models.audit_log import AuditLogModel
from app.models.graduate import GraduateModel
from app.services.audit_viewer_service import AUDIT_ACTION_GROUPS
from tests.test_upload_to_login_flow import (  # noqa: F401  (setup is a fixture)
    _GRAD_PW,
    _PW_FIELD,
    _register_and_login,
    _row,
    _upload,
    _xlsx,
    setup,
)

_NEWPW_FIELD = "new_" + "password"
_NEWPW = "New" + "pass" + "123"


def _auth(login):
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _rows(db, action=None):
    # the graduate's own rows (the admin's upload of the file comes first and is not the point here)
    stmt = select(AuditLogModel).where(AuditLogModel.actor_type == "GRADUATE").order_by(AuditLogModel.id)
    if action:
        stmt = stmt.where(AuditLogModel.action == action)
    return (await db.execute(stmt)).scalars().all()


async def _journey(client, db, setup, sent_otps, uni_id, email):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row(uni_id)]))
    login = await _register_and_login(client, sent_otps, college.id, uni_id, email)
    return login, (await db.execute(select(GraduateModel).where(GraduateModel.university_id == uni_id))).scalar_one()


async def test_the_whole_journey_leaves_its_marks(client, db, setup, sent_otps):
    event, college, headers = setup
    login, graduate = await _journey(client, db, setup, sent_otps, "930001", "mark@example.com")

    assert [r.action for r in await _rows(db)] == ["ACCOUNT_CREATED", "EMAIL_VERIFIED"]

    chosen = await client.post("/api/graduates/me/ticket", json={"companions_count": 2, "confirm": True}, headers=_auth(login))
    assert chosen.status_code == 201, chosen.text
    changed = await client.post("/api/graduates/me/ticket", json={"companions_count": 3, "confirm": True}, headers=_auth(login))
    assert changed.status_code == 201, changed.text
    again = await client.post("/api/graduates/me/ticket", json={"companions_count": 3, "confirm": True}, headers=_auth(login))
    assert again.status_code == 201  # the same package again is not a new event

    paid = await client.post(
        "/api/graduates/me/payment",
        json={"transaction_number": "TX-930001", "amount": "150000", "sender_name": "محمد أحمد"},
        headers=_auth(login),
    )
    assert paid.status_code == 201, paid.text

    forgot = await client.post("/api/auth/forgot-password", json={"email": "mark@example.com"})
    assert forgot.status_code == 200
    reset = await client.post(
        "/api/auth/reset-password",
        json={"email": "mark@example.com", "code": sent_otps[-1][1], _NEWPW_FIELD: _NEWPW},
    )
    assert reset.status_code == 200, reset.text

    rows = await _rows(db)
    assert [r.action for r in rows] == [
        "ACCOUNT_CREATED", "EMAIL_VERIFIED", "PACKAGE_SELECTED", "PACKAGE_CHANGED", "PAYMENT_SUBMITTED", "PASSWORD_RESET",
    ]
    for row in rows:
        assert row.actor_type == "GRADUATE" and row.actor_id == graduate.id
        assert row.graduate_id == graduate.id and row.event_id == event.id
    assert rows[2].ticket_id is not None and rows[2].ticket_id == rows[3].ticket_id == rows[4].ticket_id
    assert "TX-930001" in rows[4].details and "150000" in rows[4].details


async def test_the_log_never_holds_secrets(client, db, setup, sent_otps):
    login, graduate = await _journey(client, db, setup, sent_otps, "930002", "secret@example.com")
    code = sent_otps[-1][1]
    await client.post("/api/auth/forgot-password", json={"email": "secret@example.com"})
    reset_code = sent_otps[-1][1]
    await client.post("/api/auth/reset-password", json={"email": "secret@example.com", "code": reset_code, _NEWPW_FIELD: _NEWPW})
    text = " ".join(f"{r.target} {r.details}" for r in await _rows(db))
    for secret in ("secret@example.com", _GRAD_PW, _NEWPW, code, reset_code):
        assert secret not in text, secret


async def test_a_failed_step_leaves_no_mark(client, db, setup, sent_otps):
    login, graduate = await _journey(client, db, setup, sent_otps, "930003", "fail@example.com")
    before = len(await _rows(db))
    wrong_amount = await client.post(
        "/api/graduates/me/payment",
        json={"transaction_number": "TX-930003", "amount": "1", "sender_name": "محمد أحمد"},
        headers=_auth(login),
    )
    assert wrong_amount.status_code in (400, 404, 409)
    assert len(await _rows(db)) == before


# ------------------------------------------------------------------ filters
async def _log(client, headers, **params):
    resp = await client.get("/api/admin/audit-logs", params=params, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_filter_by_who_acted_what_kind_and_when(client, db, setup, sent_otps):
    event, college, headers = setup
    login, graduate = await _journey(client, db, setup, sent_otps, "930004", "filter@example.com")
    await client.post("/api/graduates/me/ticket", json={"companions_count": 2, "confirm": True}, headers=_auth(login))

    everything = await _log(client, headers)
    actions = [i["action"] for i in everything["items"]]
    assert "UPLOAD_UNIVERSITY_RECORDS" in actions and "ACCOUNT_CREATED" in actions and "PACKAGE_SELECTED" in actions

    only_graduate = await _log(client, headers, actor_type="GRADUATE")
    assert only_graduate["total"] >= 3
    assert all(i["actor"]["type"] == "GRADUATE" and i["actor"]["role_label"] == "خريج" for i in only_graduate["items"])
    assert all(i["actor"]["username"] == graduate.full_name for i in only_graduate["items"])  # the graduate is named

    only_admin = await _log(client, headers, actor_type="ADMIN")
    assert {i["actor"]["type"] for i in only_admin["items"]} == {"ADMIN"}

    # one kind of action, and a list of kinds
    one = await _log(client, headers, action="PACKAGE_SELECTED")
    assert {i["action"] for i in one["items"]} == {"PACKAGE_SELECTED"}
    two = await _log(client, headers, action=["PACKAGE_SELECTED", "ACCOUNT_CREATED"])
    assert {i["action"] for i in two["items"]} == {"PACKAGE_SELECTED", "ACCOUNT_CREATED"}

    # dates: now is inside today's window, the far past and the far future are empty
    now = datetime.now(timezone.utc)
    inside = await _log(client, headers, date_from=(now - timedelta(hours=1)).isoformat(), date_to=(now + timedelta(hours=1)).isoformat())
    assert inside["total"] == everything["total"]
    assert (await _log(client, headers, date_to=(now - timedelta(days=1)).isoformat()))["total"] == 0
    assert (await _log(client, headers, date_from=(now + timedelta(days=1)).isoformat()))["total"] == 0


async def test_one_search_box_finds_the_graduate_the_actor_or_a_word(client, db, setup, sent_otps, make_admin):
    event, college, headers = setup
    login, graduate = await _journey(client, db, setup, sent_otps, "930005", "search@example.com")
    await client.post("/api/graduates/me/ticket", json={"companions_count": 3, "confirm": True}, headers=_auth(login))

    by_id = await _log(client, headers, q="930005")
    assert by_id["total"] >= 3 and all(i["graduate"] and i["graduate"]["university_id"] == "930005" for i in by_id["items"])
    by_name = await _log(client, headers, q=graduate.full_name.split()[0])
    assert by_name["total"] >= 3

    admin_name = (await _log(client, headers, action="UPLOAD_UNIVERSITY_RECORDS"))["items"][0]["actor"]["username"]
    by_admin = await _log(client, headers, q=admin_name[:4])
    assert any(i["action"] == "UPLOAD_UNIVERSITY_RECORDS" for i in by_admin["items"])

    by_word = await _log(client, headers, q="المرافقين")
    assert any(i["action"] == "PACKAGE_SELECTED" for i in by_word["items"])
    assert (await _log(client, headers, q="no-such-thing-anywhere"))["total"] == 0
    # a wildcard typed by someone is only a character
    assert (await _log(client, headers, q="%"))["total"] == 0


async def test_scan_attempts_are_hidden_unless_asked(client, db, setup, sent_otps):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row("930006")]))
    from app.models.scanner import ScannerModel  # noqa: F401
    assert all(i["action"] != "qr_scanned" for i in (await _log(client, headers))["items"])
    assert (await _log(client, headers, include_scans="true"))["total"] >= (await _log(client, headers))["total"]


# ------------------------------------------------------------------ the filter menu
async def test_the_filter_menu_lists_every_action_with_a_label(client, setup):
    event, college, headers = setup
    resp = await client.get("/api/admin/audit-logs/actions", headers=headers)
    assert resp.status_code == 200, resp.text
    menu = resp.json()
    listed = {a["code"] for g in menu["groups"] for a in g["actions"]}
    assert listed == set(messages.AUDIT_ACTION_LABELS), "an action with a label is missing from the menu (or the other way round)"
    assert all(a["label"] != a["code"] for g in menu["groups"] for a in g["actions"]), "every action has an Arabic label"
    assert "UPDATE_NAME" in menu["exceptional"]
    assert len({g["key"] for g in menu["groups"]}) == len(AUDIT_ACTION_GROUPS)


async def test_the_menu_and_the_log_need_an_admin(client, db, setup, sent_otps):
    login, graduate = await _journey(client, db, setup, sent_otps, "930007", "nope@example.com")
    for path in ("/api/admin/audit-logs", "/api/admin/audit-logs/actions"):
        assert (await client.get(path)).status_code in (401, 403)
        assert (await client.get(path, headers=_auth(login))).status_code in (401, 403)
