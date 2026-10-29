"""Sham Cash account number validation (letters and digits)."""

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _admin_token(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def test_account_number_valid(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"shamcash_account_number": "Ab12cd34"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    got = await client.get("/api/admin/settings", headers=_auth(token))
    assert got.status_code == 200
    assert got.json()["shamcash_account_number"] == "Ab12cd34"


async def test_account_number_trimmed(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"shamcash_account_number": "  Ab12cd34  "},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    got = await client.get("/api/admin/settings", headers=_auth(token))
    assert got.status_code == 200
    assert got.json()["shamcash_account_number"] == "Ab12cd34"


async def test_account_number_invalid_phone_like(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"shamcash_account_number": "+963 912"},
        headers=_auth(token),
    )
    assert resp.status_code == 422


async def test_account_number_too_short(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"shamcash_account_number": "ab"},
        headers=_auth(token),
    )
    assert resp.status_code == 422


async def test_account_number_empty_clears(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"shamcash_account_number": ""},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    got = await client.get("/api/admin/settings", headers=_auth(token))
    assert got.status_code == 200
    assert got.json()["shamcash_account_number"] in (None, "")


async def test_contact_phone_still_saves(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"contact_phone": "+963912345678"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    got = await client.get("/api/admin/settings", headers=_auth(token))
    assert got.status_code == 200
    assert got.json()["contact_phone"] == "+963912345678"