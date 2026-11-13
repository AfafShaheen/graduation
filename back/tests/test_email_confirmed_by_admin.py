"""An admin confirms a graduate's e-mail while his code page is open: he must move on by himself."""

from tests.test_upload_to_login_flow import (  # noqa: F401  (setup is a fixture)
    _GRAD_PW,
    _PHONE,
    _PW_FIELD,
    _row,
    _upload,
    _verify_body,
    _xlsx,
    setup,
)


async def _registered_but_unconfirmed(client, setup, uni_id, email):
    event, college, headers = setup
    await _upload(client, headers, event.id, _xlsx([_row(uni_id)]))
    step1 = await client.post("/api/graduates/verify-step1", json=_verify_body(college.id, uni_id))
    reg = await client.post(
        "/api/graduates/register",
        json={"registration_token": step1.json()["registration_token"], "email": email, "phone": _PHONE, _PW_FIELD: _GRAD_PW},
    )
    assert reg.status_code == 201, reg.text
    return reg.json()["graduate_id"], {"Authorization": f"Bearer {reg.json()['verification_token']}"}


async def test_the_waiting_page_is_told_when_the_admin_confirms(client, setup, sent_otps):
    event, college, headers = setup
    graduate_id, waiting = await _registered_but_unconfirmed(client, setup, "960001", "wait@example.com")

    before = await client.get("/api/auth/verification-status", headers=waiting)
    assert before.status_code == 200 and before.json() == {"verified": False}

    done = await client.post(f"/api/admin/graduates/{graduate_id}/verify-email", headers=headers)
    assert done.status_code == 200, done.text

    after = await client.get("/api/auth/verification-status", headers=waiting)
    assert after.status_code == 200, after.text
    body = after.json()
    assert body["verified"] is True and body["access_token"]
    # the session it gives really works
    me = await client.get("/api/graduates/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200, me.text


async def test_an_old_code_after_the_admin_confirmed_lets_him_in_instead_of_saying_invalid(client, setup, sent_otps):
    event, college, headers = setup
    graduate_id, waiting = await _registered_but_unconfirmed(client, setup, "960002", "late@example.com")
    old_code = sent_otps[-1][1]
    await client.post(f"/api/admin/graduates/{graduate_id}/verify-email", headers=headers)

    for code in (old_code, "000000"):
        resp = await client.post("/api/auth/verify-otp", json={"code": code}, headers=waiting)
        assert resp.status_code == 200, (code, resp.text)
        assert resp.json()["access_token"]


async def test_nothing_changes_for_an_unconfirmed_graduate_with_a_wrong_code(client, setup, sent_otps):
    graduate_id, waiting = await _registered_but_unconfirmed(client, setup, "960003", "wrong@example.com")
    wrong = "000000" if sent_otps[-1][1] != "000000" else "111111"
    resp = await client.post("/api/auth/verify-otp", json={"code": wrong}, headers=waiting)
    assert resp.status_code == 400, resp.text
    assert (await client.get("/api/auth/verification-status", headers=waiting)).json() == {"verified": False}


async def test_the_status_needs_the_verification_token_and_nothing_else_will_do(client, setup, sent_otps):
    event, college, headers = setup
    graduate_id, waiting = await _registered_but_unconfirmed(client, setup, "960004", "tok@example.com")
    assert (await client.get("/api/auth/verification-status")).status_code in (401, 403)
    assert (await client.get("/api/auth/verification-status", headers={"Authorization": "Bearer nonsense"})).status_code in (401, 403)
    assert (await client.get("/api/auth/verification-status", headers=headers)).status_code in (401, 403), "an admin token is not a verification token"


async def test_the_correct_code_still_works_as_before(client, setup, sent_otps):
    graduate_id, waiting = await _registered_but_unconfirmed(client, setup, "960005", "ok@example.com")
    resp = await client.post("/api/auth/verify-otp", json={"code": sent_otps[-1][1]}, headers=waiting)
    assert resp.status_code == 200 and resp.json()["access_token"]
    # and asking after it is the same answer
    assert (await client.get("/api/auth/verification-status", headers=waiting)).json()["verified"] is True
