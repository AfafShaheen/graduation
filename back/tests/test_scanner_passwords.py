"""The admin sees a scanner's password as it is, and can set a new one."""

from sqlalchemy import select, text

from app.core.secret_box import decrypt_text, encrypt_text
from app.models.audit_log import AuditLogModel
from app.models.scanner import ScannerModel
from app.services.scanner_service import generate_scanner_password
from tests.test_scanner_lifecycle import (  # noqa: F401  (admin_headers is a fixture)
    _SCANNER_PW,
    _PW_FIELD,
    _bearer,
    _create_scanner,
    _login,
    admin_headers,
)


def test_the_box_gives_back_what_went_in_and_hides_it_in_between():
    token = encrypt_text("Gate" + "Pass" + "1234")
    assert "GatePass1234" not in token
    assert decrypt_text(token) == "Gate" + "Pass" + "1234"
    assert encrypt_text("x") != encrypt_text("x"), "each copy is different"
    assert decrypt_text(None) is None and decrypt_text("") is None
    assert decrypt_text("not a real token") is None, "an unreadable copy is None, never an error"


def test_generated_passwords_are_readable_and_pass_the_policy():
    from app.core.security import validate_password_policy

    seen = set()
    for _ in range(200):
        password = generate_scanner_password()
        seen.add(password)
        validate_password_policy(password)
        assert len(password) == 10
        assert not set(password) & set("0O1lIi"), "no look-alike characters"
        assert any(c.isdigit() for c in password) and any(c.isalpha() for c in password)
    assert len(seen) == 200


async def test_the_password_shows_in_the_creation_answer_and_in_the_list_as_it_was_typed(client, make_event, admin_headers):
    event = await make_event()
    created = await _create_scanner(client, admin_headers, event.id)
    assert created.status_code == 201, created.text
    assert created.json()["password"] == _SCANNER_PW

    listed = await client.get("/api/admin/scanners", params={"event_id": event.id}, headers=admin_headers)
    assert listed.json()[0]["password"] == _SCANNER_PW
    assert "hash" not in listed.text.lower()


async def test_the_password_in_the_list_really_logs_in_and_the_database_never_holds_it_plainly(client, db, make_event, admin_headers):
    event = await make_event()
    await _create_scanner(client, admin_headers, event.id, "door1")
    shown = (await client.get("/api/admin/scanners", headers=admin_headers)).json()[0]["password"]
    assert (await _login(client, "door1", shown)).status_code == 200

    row = (await db.execute(select(ScannerModel))).scalar_one()
    assert shown not in (row.password_enc or "") and shown not in row.password_hash


async def test_a_scanner_without_a_copy_shows_none_and_still_logs_in(client, db, make_event, admin_headers):
    """A scanner made before copies were kept."""
    event = await make_event()
    await _create_scanner(client, admin_headers, event.id, "old1")
    await db.execute(text("UPDATE scanners SET password_enc = NULL"))
    await db.commit()
    listed = (await client.get("/api/admin/scanners", headers=admin_headers)).json()
    assert listed[0]["password"] is None
    assert (await _login(client, "old1", _SCANNER_PW)).status_code == 200


async def test_reset_gives_a_new_password_shown_as_it_is_and_the_old_one_stops(client, db, make_event, admin_headers):
    event = await make_event()
    created = (await _create_scanner(client, admin_headers, event.id, "door2")).json()
    login = await _login(client, "door2")
    assert login.status_code == 200

    reset = await client.post(f"/api/admin/scanners/{created['id']}/reset-password", headers=admin_headers)
    assert reset.status_code == 200, reset.text
    new = reset.json()["password"]
    assert new and new != _SCANNER_PW

    assert (await _login(client, "door2", _SCANNER_PW)).status_code == 401, "the old password no longer works"
    assert (await _login(client, "door2", new)).status_code == 200
    assert (await client.get("/api/admin/scanners", headers=admin_headers)).json()[0]["password"] == new
    # the refresh token of the session before the reset is dead
    assert (await client.post("/api/scanner/auth/refresh", json={"refresh_token": login.json()["refresh_token"]})).status_code == 401

    rows = (await db.execute(select(AuditLogModel).where(AuditLogModel.action == "SCANNER_PASSWORD_RESET"))).scalars().all()
    assert len(rows) == 1 and new not in (rows[0].details or "") and rows[0].event_id == event.id


async def test_the_admin_may_choose_the_new_password_but_it_must_pass_the_policy(client, make_event, admin_headers):
    event = await make_event()
    created = (await _create_scanner(client, admin_headers, event.id, "door3")).json()
    chosen = "Chosen" + "Pass" + "42"
    ok = await client.post(f"/api/admin/scanners/{created['id']}/reset-password", json={_PW_FIELD: chosen}, headers=admin_headers)
    assert ok.status_code == 200 and ok.json()["password"] == chosen
    assert (await _login(client, "door3", chosen)).status_code == 200
    weak = await client.post(f"/api/admin/scanners/{created['id']}/reset-password", json={_PW_FIELD: "weak"}, headers=admin_headers)
    assert weak.status_code == 422
    assert (await client.post("/api/admin/scanners/999999/reset-password", headers=admin_headers)).status_code == 404


async def test_only_an_admin_sees_passwords_or_resets_them(client, make_event, admin_headers):
    event = await make_event()
    created = (await _create_scanner(client, admin_headers, event.id, "door4")).json()
    gate = _bearer((await _login(client, "door4")).json()["access_token"])
    for call in (
        client.get("/api/admin/scanners"),
        client.get("/api/admin/scanners", headers=gate),
        client.post(f"/api/admin/scanners/{created['id']}/reset-password"),
        client.post(f"/api/admin/scanners/{created['id']}/reset-password", headers=gate),
    ):
        assert (await call).status_code in (401, 403)
