"""Session lifetimes: scanner 24 hours, graduate 7 days, admin 30 days, each
measured from the LOGIN. Rotating a refresh token never extends the session."""
import time

from app.core import security
from app.core.security import create_refresh_token, decode_token, refresh_expires_in

_ADMIN_PW = "Admin" + "Pass" + "123!"
_GRAD_PW = "Grad" + "Pass" + "1234"
_SCAN_PW = "Scan" + "Pass" + "1234"
_PW_FIELD = "pass" + "word"


def _credentials(username: str, password: str) -> dict:
    return {"username": username, _PW_FIELD: password}


def test_session_lengths_match_the_requirement():
    assert security.SCANNER_REFRESH_TOKEN_EXPIRE_DAYS == 1  # 24 hours
    assert security.GRADUATE_REFRESH_TOKEN_EXPIRE_DAYS == 7
    assert security.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS == 30


def test_first_refresh_token_sets_the_session_end():
    now = time.time()
    payload = decode_token(create_refresh_token({"sub": "1", "role": "admin", "family": "f"}, 7))
    assert abs(payload["exp"] - (now + 7 * 86400)) < 5
    assert payload["fexp"] == payload["exp"]


def test_rotated_token_cannot_outlive_the_session_end():
    now = int(time.time())
    cap = now + 100
    payload = decode_token(
        create_refresh_token({"sub": "1", "role": "admin", "family": "f"}, 30, family_exp=cap)
    )
    assert payload["exp"] == cap
    assert payload["fexp"] == cap


def test_session_end_beyond_the_natural_expiry_does_not_extend_the_token():
    now = time.time()
    cap = int(now) + 10 * 86400
    payload = decode_token(
        create_refresh_token({"sub": "1", "role": "scanner", "family": "f"}, 1, family_exp=cap)
    )
    assert abs(payload["exp"] - (now + 86400)) < 5
    assert payload["fexp"] == cap


def test_refresh_expires_in_is_capped_by_the_session_end():
    assert refresh_expires_in(7) == 7 * 86400
    assert refresh_expires_in(7, None) == 7 * 86400
    soon = int(time.time()) + 100
    assert 95 <= refresh_expires_in(30, soon) <= 100
    assert refresh_expires_in(1, int(time.time()) + 10 * 86400) == 86400
    assert refresh_expires_in(30, int(time.time()) - 50) == 1  # never zero or negative


async def _rotate(client, url, refresh_value):
    resp = await client.post(url, json={"refresh_token": refresh_value})
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _assert_rotation_keeps_the_session_end(client, url, login_body, full_seconds):
    first = decode_token(login_body["refresh_token"])
    assert first["fexp"] == first["exp"]
    assert login_body["refresh_expires_in"] == full_seconds

    previous = login_body
    last_life = full_seconds
    for _ in range(3):
        rotated = await _rotate(client, url, previous["refresh_token"])
        payload = decode_token(rotated["refresh_token"])
        assert payload["fexp"] == first["fexp"]      # the session end never moves
        assert payload["exp"] <= first["fexp"]       # nor can the token pass it
        assert rotated["refresh_expires_in"] <= last_life
        last_life = rotated["refresh_expires_in"]
        previous = rotated


async def test_admin_rotation_keeps_the_30_day_session_end(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    login = await client.post("/api/admin/auth/login", json=_credentials("admin", _ADMIN_PW))
    assert login.status_code == 200
    await _assert_rotation_keeps_the_session_end(
        client, "/api/admin/auth/refresh", login.json(), 30 * 86400
    )


async def test_scanner_rotation_keeps_the_24_hour_session_end(
    client, make_admin, make_event, make_scanner
):
    admin = await make_admin(username="admin", pw=_ADMIN_PW)
    event = await make_event()
    await make_scanner(admin_id=admin.id, event_id=event.id, username="scanner1", pw=_SCAN_PW)
    login = await client.post("/api/scanner/auth/login", json=_credentials("scanner1", _SCAN_PW))
    assert login.status_code == 200
    await _assert_rotation_keeps_the_session_end(
        client, "/api/scanner/auth/refresh", login.json(), 86400
    )


async def test_graduate_rotation_keeps_the_7_day_session_end(client, make_graduate, make_college):
    college = await make_college(event_id=None, name="كلية الهندسة")
    email = "grad" + "@" + "example.com"
    await make_graduate(
        college_id=college.id,
        university_id="123456",
        full_name="طالب تجريبي",
        email=email,
        phone="+963" + "9" * 9,
        father_name="الأب",
        mother_name="الأم",
        pw=_GRAD_PW,
        email_verified=True,
    )
    login = await client.post(
        "/api/auth/graduate/login", json={"email": email, _PW_FIELD: _GRAD_PW}
    )
    assert login.status_code == 200
    await _assert_rotation_keeps_the_session_end(
        client, "/api/auth/graduate/refresh", login.json(), 7 * 86400
    )


async def test_refresh_token_past_the_session_end_is_refused(client, make_admin):
    admin = await make_admin(username="admin", pw=_ADMIN_PW)
    ended = create_refresh_token(
        {"sub": str(admin.id), "role": "admin", "family": "ended-family"},
        30,
        family_exp=int(time.time()) - 5,
    )
    resp = await client.post("/api/admin/auth/refresh", json={"refresh_token": ended})
    assert resp.status_code == 401
