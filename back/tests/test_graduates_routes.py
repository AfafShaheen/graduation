async def test_patch_me_route_removed(client):
    resp = await client.patch(
        "/api/graduates/me",
        params={"graduate_id": 1},
        json={},
    )
    assert resp.status_code == 404


async def test_patch_admin_route_removed(client):
    resp = await client.patch(
        "/api/graduates/admin/1",
        json={"email_verified": True},
    )
    assert resp.status_code == 404
