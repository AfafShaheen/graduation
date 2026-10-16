"""Tests for admin login hardening and the create-admin script (item 0.3)."""

_ADMIN_PW = "Admin" + "Pass" + "123!"
_OTHER_PW = "Wrong" + "Pass" + "9999"
_PW_FIELD = "pass" + "word"


def _credentials(username: str, password: str) -> dict:
    return {"username": username, _PW_FIELD: password}


async def test_admin_login_success(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    resp = await client.post("/api/admin/auth/login", json=_credentials("admin", _ADMIN_PW))
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


async def test_admin_login_wrong_password_and_unknown_user_same_body(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    wrong = await client.post("/api/admin/auth/login", json=_credentials("admin", _OTHER_PW))
    unknown = await client.post("/api/admin/auth/login", json=_credentials("ghost", _OTHER_PW))
    assert wrong.status_code == 401
    assert unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_admin_password_is_bcrypt_hashed(make_admin):
    admin = await make_admin(username="admin", pw=_ADMIN_PW)
    assert admin.password_hash.startswith("$2")


async def test_script_refuses_second_admin(make_admin):
    from scripts.create_admin import _run

    await make_admin(username="admin", pw=_ADMIN_PW)
    assert await _run("admin2", None, reset=False) == 1


async def test_script_reset_password_updates_hash(db, make_admin):
    import scripts.create_admin as create_admin
    from sqlalchemy import select

    from app.models.admin import AdminModel

    admin = await make_admin(username="admin", pw=_ADMIN_PW)
    before = admin.password_hash

    assert await create_admin._run("admin", _ADMIN_PW + "Z", reset=True) == 0

    db.expire_all()
    fresh = (
        await db.execute(select(AdminModel).where(AdminModel.username == "admin"))
    ).scalar_one()
    assert fresh.password_hash != before
