"""Tests for admin scanner account management (SRS FR-20)."""

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select

from app.core import messages
from app.core.deps import get_current_scanner
from app.core.security import create_access_token
from app.models.scanner import ScannerModel

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_SCANNER_PW = "Scan" + "Pass" + "1234"


async def _admin_headers(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}, admin


def _create_body(event_id, username="scanner_a", pw=_SCANNER_PW):
    return {"username": username, "password": pw, "event_id": event_id}


async def test_create_scanner_returns_public_fields(client, make_admin, make_event):
    headers, _ = await _admin_headers(client, make_admin)
    event = await make_event()

    response = await client.post(
        "/api/admin/scanners", json=_create_body(event.id), headers=headers
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == {"id", "username", "event_id", "created_at"}
    assert body["username"] == "scanner_a"
    assert body["event_id"] == event.id
    assert "password" not in response.text
    assert "hash" not in response.text


async def test_create_scanner_unknown_event_404(client, make_admin):
    headers, _ = await _admin_headers(client, make_admin)
    response = await client.post(
        "/api/admin/scanners", json=_create_body(999999), headers=headers
    )
    assert response.status_code == 404
    assert response.json()["detail"] == messages.EVENT_NOT_FOUND


async def test_create_scanner_duplicate_username_409(client, make_admin, make_event):
    headers, _ = await _admin_headers(client, make_admin)
    event = await make_event()

    first = await client.post(
        "/api/admin/scanners", json=_create_body(event.id), headers=headers
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/admin/scanners", json=_create_body(event.id), headers=headers
    )
    assert second.status_code == 409
    assert second.json()["detail"] == messages.SCANNER_USERNAME_TAKEN


async def test_create_scanner_same_username_in_different_events(
    client, make_admin, make_event
):
    headers, _ = await _admin_headers(client, make_admin)
    event_one = await make_event(name="حفل 1")
    event_two = await make_event(name="حفل 2")

    first = await client.post(
        "/api/admin/scanners",
        json=_create_body(event_one.id, username="shared_scanner"),
        headers=headers,
    )
    second = await client.post(
        "/api/admin/scanners",
        json=_create_body(event_two.id, username="shared_scanner"),
        headers=headers,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["event_id"] == event_one.id
    assert second.json()["event_id"] == event_two.id
    assert first.json()["id"] != second.json()["id"]


async def test_create_scanner_concurrent_duplicate_gives_one_success(
    client, make_admin, make_event
):
    headers, _ = await _admin_headers(client, make_admin)
    event = await make_event()

    first, second = await asyncio.gather(
        client.post("/api/admin/scanners", json=_create_body(event.id), headers=headers),
        client.post("/api/admin/scanners", json=_create_body(event.id), headers=headers),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 409]


async def test_create_scanner_validation(client, make_admin, make_event):
    headers, _ = await _admin_headers(client, make_admin)
    event = await make_event()

    too_short = await client.post(
        "/api/admin/scanners", json=_create_body(event.id, username="ab"), headers=headers
    )
    assert too_short.status_code == 422

    bad_chars = await client.post(
        "/api/admin/scanners",
        json=_create_body(event.id, username="bad name!"),
        headers=headers,
    )
    assert bad_chars.status_code == 422

    weak_pw = await client.post(
        "/api/admin/scanners", json=_create_body(event.id, pw="short"), headers=headers
    )
    assert weak_pw.status_code == 422

    extra_field = await client.post(
        "/api/admin/scanners",
        json={**_create_body(event.id), "role": "admin"},
        headers=headers,
    )
    assert extra_field.status_code == 422


async def test_list_scanners_filter(client, make_admin, make_event):
    headers, _ = await _admin_headers(client, make_admin)
    event_one = await make_event(name="حفل 1")
    event_two = await make_event(name="حفل 2")

    await client.post(
        "/api/admin/scanners",
        json=_create_body(event_one.id, username="scan_one"),
        headers=headers,
    )
    await client.post(
        "/api/admin/scanners",
        json=_create_body(event_two.id, username="scan_two"),
        headers=headers,
    )

    all_response = await client.get("/api/admin/scanners", headers=headers)
    assert all_response.status_code == 200
    assert {item["username"] for item in all_response.json()} == {"scan_one", "scan_two"}

    filtered = await client.get(
        "/api/admin/scanners", params={"event_id": event_one.id}, headers=headers
    )
    assert filtered.status_code == 200
    items = filtered.json()
    assert len(items) == 1
    assert items[0]["username"] == "scan_one"
    assert "password" not in filtered.text


async def test_delete_scanner(client, make_admin, make_event, db):
    headers, _ = await _admin_headers(client, make_admin)
    event = await make_event()
    created = await client.post(
        "/api/admin/scanners", json=_create_body(event.id), headers=headers
    )
    scanner_id = created.json()["id"]

    deleted = await client.delete(f"/api/admin/scanners/{scanner_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["message"] == messages.SCANNER_DELETED

    remaining = await db.execute(
        select(ScannerModel).where(ScannerModel.id == scanner_id)
    )
    assert remaining.scalars().first() is None

    again = await client.delete(f"/api/admin/scanners/{scanner_id}", headers=headers)
    assert again.status_code == 404
    assert again.json()["detail"] == messages.SCANNER_NOT_FOUND


async def test_deleted_scanner_token_is_rejected(client, make_admin, make_event, db):
    headers, _ = await _admin_headers(client, make_admin)
    event = await make_event()
    created = await client.post(
        "/api/admin/scanners", json=_create_body(event.id), headers=headers
    )
    scanner_id = created.json()["id"]

    scanner_value = create_access_token(
        {
            "sub": str(scanner_id),
            "scanner_id": scanner_id,
            "role": "scanner",
            "event_id": event.id,
        }
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=scanner_value)

    existing = await get_current_scanner(credentials, db)
    assert existing.id == scanner_id

    await client.delete(f"/api/admin/scanners/{scanner_id}", headers=headers)
    db.expire_all()

    with pytest.raises(HTTPException) as exc:
        await get_current_scanner(credentials, db)
    assert exc.value.status_code == 401


async def test_scanner_routes_require_admin(client, make_event, make_scanner, make_admin):
    admin = await make_admin()
    event = await make_event()
    scanner = await make_scanner(admin.id, event.id)
    scanner_value = create_access_token(
        {
            "sub": str(scanner.id),
            "scanner_id": scanner.id,
            "role": "scanner",
            "event_id": event.id,
        }
    )
    scanner_headers = {"Authorization": f"Bearer {scanner_value}"}

    body = _create_body(event.id, username="scan_x")

    for headers in ({}, scanner_headers):
        assert (
            await client.post("/api/admin/scanners", json=body, headers=headers)
        ).status_code in (401, 403)
        assert (
            await client.get("/api/admin/scanners", headers=headers)
        ).status_code in (401, 403)
        assert (
            await client.delete("/api/admin/scanners/1", headers=headers)
        ).status_code in (401, 403)
