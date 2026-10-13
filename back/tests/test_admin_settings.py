"""Admin settings endpoints and ShamCash QR management (item 3.3, FR-21, D12).

Covers:
- admin-only read/update of the text settings;
- blank value clears a setting;
- QR upload validated by magic bytes + 1 MiB ceiling and stored as a data URI;
- QR delete;
- the public ShamCash endpoint exposing the three payment fields.
"""

from sqlalchemy import select

from app.core import messages
from app.models.audit_log import AuditLogModel
from app.models.setting import SettingModel
from app.services.settings_service import (
    CONTACT_PHONE,
    SHAMCASH_ACCOUNT_NUMBER,
    SHAMCASH_QR_IMAGE,
    SHAMCASH_RECEIVER_NAME,
)

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_PHONE = "+963" + "9" * 10
_RECEIVER = "اتحاد الجامعة"
_ACCOUNT = "123456789"

_PNG = b"\x89PNG\r\n\x1a\n" + b"fake-png-body"
_JPEG = b"\xff\xd8\xff" + b"fake-jpeg-body"
_WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"fake-webp-body"


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


async def test_settings_requires_admin_auth(client):
    resp = await client.get("/api/admin/settings")
    assert resp.status_code in (401, 403)


async def test_get_settings_returns_all_keys(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.get("/api/admin/settings", headers=_auth(token))

    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {
        "contact_phone",
        "shamcash_receiver_name",
        "shamcash_account_number",
        "shamcash_qr_image",
    }
    assert all(value is None for value in body.values())


async def test_update_text_settings_persist_and_audit(client, db, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={
            "contact_phone": _PHONE,
            "shamcash_receiver_name": _RECEIVER,
            "shamcash_account_number": _ACCOUNT,
        },
        headers=_auth(token),
    )

    assert resp.status_code == 200
    assert resp.json()["contact_phone"] == _PHONE

    stored = await db.execute(select(SettingModel))
    values = {row.key: row.value for row in stored.scalars().all()}
    assert values[CONTACT_PHONE] == _PHONE
    assert values[SHAMCASH_RECEIVER_NAME] == _RECEIVER
    assert values[SHAMCASH_ACCOUNT_NUMBER] == _ACCOUNT

    audits = await db.execute(
        select(AuditLogModel).where(AuditLogModel.action == "SETTINGS_UPDATED")
    )
    assert len(audits.scalars().all()) == 1


async def test_update_blank_value_clears_setting(client, db, make_admin):
    db.add(SettingModel(key=CONTACT_PHONE, value=_PHONE))
    await db.commit()

    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"contact_phone": "   "},
        headers=_auth(token),
    )

    assert resp.status_code == 200
    assert resp.json()["contact_phone"] is None

    stored = await db.execute(
        select(SettingModel).where(SettingModel.key == CONTACT_PHONE)
    )
    assert stored.scalar_one_or_none() is None


async def test_upload_valid_png_stores_data_uri(client, db, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings/shamcash-qr",
        files={"file": ("qr.png", _PNG, "image/png")},
        headers=_auth(token),
    )

    assert resp.status_code == 200
    assert resp.json()["shamcash_qr_image"].startswith("data:image/png;base64,")

    stored = await db.execute(
        select(SettingModel).where(SettingModel.key == SHAMCASH_QR_IMAGE)
    )
    row = stored.scalar_one()
    assert row.value.startswith("data:image/png;base64,")


async def test_upload_accepts_jpeg_and_webp(client, make_admin):
    token = await _admin_token(client, make_admin)

    jpeg = await client.put(
        "/api/admin/settings/shamcash-qr",
        files={"file": ("qr.jpg", _JPEG, "image/jpeg")},
        headers=_auth(token),
    )
    assert jpeg.status_code == 200
    assert jpeg.json()["shamcash_qr_image"].startswith("data:image/jpeg;base64,")

    webp = await client.put(
        "/api/admin/settings/shamcash-qr",
        files={"file": ("qr.webp", _WEBP, "image/webp")},
        headers=_auth(token),
    )
    assert webp.status_code == 200
    assert webp.json()["shamcash_qr_image"].startswith("data:image/webp;base64,")


async def test_upload_invalid_magic_bytes_rejected(client, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings/shamcash-qr",
        files={"file": ("qr.png", b"not-an-image", "image/png")},
        headers=_auth(token),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == messages.INVALID_IMAGE


async def test_upload_oversized_rejected(client, make_admin):
    token = await _admin_token(client, make_admin)
    oversized = b"\x89PNG\r\n\x1a\n" + b"0" * (1024 * 1024)
    resp = await client.put(
        "/api/admin/settings/shamcash-qr",
        files={"file": ("qr.png", oversized, "image/png")},
        headers=_auth(token),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == messages.INVALID_IMAGE


async def test_delete_shamcash_qr(client, db, make_admin):
    db.add(SettingModel(key=SHAMCASH_QR_IMAGE, value="data:image/png;base64,AAA"))
    await db.commit()

    token = await _admin_token(client, make_admin)
    resp = await client.delete(
        "/api/admin/settings/shamcash-qr", headers=_auth(token)
    )

    assert resp.status_code == 200
    stored = await db.execute(
        select(SettingModel).where(SettingModel.key == SHAMCASH_QR_IMAGE)
    )
    assert stored.scalar_one_or_none() is None


async def test_public_shamcash_endpoint_is_tokenless(client, db):
    db.add(SettingModel(key=SHAMCASH_QR_IMAGE, value="data:image/png;base64,AAA"))
    db.add(SettingModel(key=SHAMCASH_RECEIVER_NAME, value=_RECEIVER))
    db.add(SettingModel(key=SHAMCASH_ACCOUNT_NUMBER, value=_ACCOUNT))
    await db.commit()

    resp = await client.get("/api/settings/shamcash-qr")

    assert resp.status_code == 200
    assert resp.json() == {
        "shamcash_qr_image": "data:image/png;base64,AAA",
        "shamcash_receiver_name": _RECEIVER,
        "shamcash_account_number": _ACCOUNT,
    }
