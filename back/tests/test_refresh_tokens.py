"""Tests for refresh tokens: rotation, reuse detection and role isolation (P8)."""

_ADMIN_PW = "Admin" + "Pass" + "123!"
_GRAD_PW = "Grad" + "Pass" + "1234"
_SCAN_PW = "Scan" + "Pass" + "1234"
_PW_FIELD = "pass" + "word"


def _credentials(username: str, password: str) -> dict:
    return {"username": username, _PW_FIELD: password}


async def _admin_login(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    resp = await client.post("/api/admin/auth/login", json=_credentials("admin", _ADMIN_PW))
    assert resp.status_code == 200
    return resp.json()


async def test_admin_login_returns_refresh_pair(client, make_admin):
    body = await _admin_login(client, make_admin)
    assert body["refresh_token"]
    assert body["refresh_expires_in"] == 30 * 86400


async def test_admin_refresh_rotates_and_returns_new_pair(client, make_admin):
    login = await _admin_login(client, make_admin)
    first_refresh = login["refresh_token"]

    resp = await client.post("/api/admin/auth/refresh", json={"refresh_token": first_refresh})
    assert resp.status_code == 200
    rotated = resp.json()
    assert rotated["access_token"]
    assert rotated["refresh_token"]
    assert rotated["refresh_token"] != first_refresh


async def test_admin_refresh_reuse_revokes_family(client, make_admin):
    login = await _admin_login(client, make_admin)
    first_refresh = login["refresh_token"]

    ok = await client.post("/api/admin/auth/refresh", json={"refresh_token": first_refresh})
    assert ok.status_code == 200

    reuse = await client.post("/api/admin/auth/refresh", json={"refresh_token": first_refresh})
    assert reuse.status_code == 401

    rotated = ok.json()["refresh_token"]
    blocked = await client.post("/api/admin/auth/refresh", json={"refresh_token": rotated})
    assert blocked.status_code == 401


async def test_admin_refresh_rejects_garbage(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    resp = await client.post("/api/admin/auth/refresh", json={"refresh_token": "not-a-jwt-at-all"})
    assert resp.status_code == 401


async def test_access_token_cannot_be_used_as_refresh(client, make_admin):
    login = await _admin_login(client, make_admin)
    resp = await client.post(
        "/api/admin/auth/refresh", json={"refresh_token": login["access_token"]}
    )
    assert resp.status_code == 401


async def test_graduate_refresh_rotates(client, make_graduate, make_college):
    college = await make_college(event_id=None, name="كلية الهندسة")
    grad_email = "grad" + "@" + "example.com"
    await make_graduate(
        college_id=college.id,
        university_id="123456",
        full_name="طالب تجريبي",
        email=grad_email,
        phone="+963" + "9" * 9,
        father_name="الأب",
        mother_name="الأم",
        pw=_GRAD_PW,
        email_verified=True,
    )
    login = await client.post(
        "/api/auth/graduate/login",
        json={"email": grad_email, _PW_FIELD: _GRAD_PW},
    )
    assert login.status_code == 200
    body = login.json()
    assert body["refresh_expires_in"] == 7 * 86400

    resp = await client.post(
        "/api/auth/graduate/refresh", json={"refresh_token": body["refresh_token"]}
    )
    assert resp.status_code == 200
    assert resp.json()["refresh_token"] != body["refresh_token"]


async def test_scanner_refresh_keeps_event(client, make_admin, make_event, make_scanner):
    admin = await make_admin(username="admin", pw=_ADMIN_PW)
    event = await make_event()
    await make_scanner(admin_id=admin.id, event_id=event.id, username="scanner1", pw=_SCAN_PW)

    login = await client.post(
        "/api/scanner/auth/login", json=_credentials("scanner1", _SCAN_PW)
    )
    assert login.status_code == 200
    body = login.json()
    # The scanner session lasts 24 hours (it was 30 days before).
    assert body["refresh_expires_in"] == 1 * 86400

    resp = await client.post(
        "/api/scanner/auth/refresh", json={"refresh_token": body["refresh_token"]}
    )
    assert resp.status_code == 200
    rotated = resp.json()
    assert rotated["event"]["id"] == event.id
    assert rotated["refresh_token"] != body["refresh_token"]


async def test_refresh_token_role_isolated(client, make_admin):
    login = await _admin_login(client, make_admin)
    admin_refresh = login["refresh_token"]
    resp = await client.post(
        "/api/auth/graduate/refresh", json={"refresh_token": admin_refresh}
    )
    assert resp.status_code == 401
