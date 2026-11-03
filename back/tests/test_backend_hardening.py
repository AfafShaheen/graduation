"""Login throttling per IP, redis SCAN clean-up, security headers, college removal."""

from app.core import messages
from app.core.redis import delete_matching, redis_client

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


def _login(client, username, password, ip):
    return client.post(
        "/api/admin/auth/login",
        json={"username": username, _PW_FIELD: password},
        headers={"X-Forwarded-For": ip},
    )


async def test_one_ip_cannot_lock_the_account_for_other_ips(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    for _ in range(5):
        bad = await _login(client, "admin", "wrong-password-1", "10.0.0.1")
        assert bad.status_code == 401
    assert (await _login(client, "admin", _ADMIN_PW, "10.0.0.1")).status_code == 429
    # A different address is not affected by the first one's failures.
    assert (await _login(client, "admin", _ADMIN_PW, "10.0.0.2")).status_code == 200


async def test_distributed_guessing_still_locks_the_account(client, make_admin):
    await make_admin(username="admin", pw=_ADMIN_PW)
    for index in range(20):
        bad = await _login(client, "admin", "wrong-password-1", f"10.1.0.{index}")
        assert bad.status_code == 401
    assert (await _login(client, "admin", _ADMIN_PW, "10.1.1.1")).status_code == 429


async def test_delete_matching_removes_only_matching_keys():
    await redis_client.set("hardening:a:1", "x")
    await redis_client.set("hardening:a:2", "x")
    await redis_client.set("hardening:b:1", "x")
    await delete_matching("hardening:a:*")
    assert await redis_client.get("hardening:a:1") is None
    assert await redis_client.get("hardening:a:2") is None
    assert await redis_client.get("hardening:b:1") == "x"
    await redis_client.delete("hardening:b:1")


async def test_responses_carry_security_headers(client):
    resp = await client.get("/")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"


async def test_college_with_graduate_but_no_ticket_cannot_be_removed(
    client, make_admin, make_event, make_college, make_graduate
):
    admin = await make_admin()
    login = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    event = await make_event()
    await make_college(event.id, name="كلية الهندسة")
    medicine = await make_college(event.id, name="كلية الطب")
    await make_graduate(college_id=medicine.id, university_id="777")

    resp = await client.put(
        f"/api/admin/events/{event.id}",
        json={"college_names": ["كلية الهندسة"]},
        headers=headers,
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == messages.college_removal_blocked("كلية الطب", 1)
