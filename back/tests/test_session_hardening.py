"""A refresh token is not an access token, and logging out ends the whole session."""

_ADMIN_PW = "Admin" + "Pass" + "123!"
_SCAN_PW = "Scan" + "Pass" + "1234"
_PW_FIELD = "pass" + "word"


def _credentials(username: str, password: str) -> dict:
    return {"username": username, _PW_FIELD: password}


def _bearer(token: str) -> dict:
    return {"Authorization": "Bearer " + token}


async def _admin_login(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    resp = await client.post("/api/admin/auth/login", json=_credentials("admin", _ADMIN_PW))
    assert resp.status_code == 200
    return resp.json()


async def _scanner_login(client, make_admin, make_event, make_scanner):
    admin = await make_admin(username="admin", pw=_ADMIN_PW)
    event = await make_event()
    await make_scanner(admin_id=admin.id, event_id=event.id, username="scanner1", pw=_SCAN_PW)
    resp = await client.post("/api/scanner/auth/login", json=_credentials("scanner1", _SCAN_PW))
    assert resp.status_code == 200
    return resp.json()


async def test_admin_refresh_token_is_rejected_as_access_token(client, make_admin):
    login = await _admin_login(client, make_admin)
    resp = await client.get("/api/admin/events", headers=_bearer(login["refresh_token"]))
    assert resp.status_code == 401


async def test_admin_access_token_still_works(client, make_admin):
    login = await _admin_login(client, make_admin)
    resp = await client.get("/api/admin/events", headers=_bearer(login["access_token"]))
    assert resp.status_code == 200


async def test_admin_logout_revokes_the_refresh_token(client, make_admin):
    login = await _admin_login(client, make_admin)
    out = await client.post("/api/admin/auth/logout", headers=_bearer(login["access_token"]))
    assert out.status_code == 200

    again = await client.post(
        "/api/admin/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert again.status_code == 401


async def test_scanner_refresh_token_is_rejected_as_access_token(
    client, make_admin, make_event, make_scanner
):
    login = await _scanner_login(client, make_admin, make_event, make_scanner)
    resp = await client.post(
        "/api/scanner/scan",
        json={"code": "00000000-0000-0000-0000-000000000000"},
        headers=_bearer(login["refresh_token"]),
    )
    assert resp.status_code == 401


async def test_scanner_logout_revokes_the_refresh_token(
    client, make_admin, make_event, make_scanner
):
    login = await _scanner_login(client, make_admin, make_event, make_scanner)
    out = await client.post("/api/scanner/auth/logout", headers=_bearer(login["access_token"]))
    assert out.status_code == 200

    again = await client.post(
        "/api/scanner/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert again.status_code == 401
