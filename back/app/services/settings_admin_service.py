"""Admin-facing settings management (FR-21).

Responsibilities
----------------
- Read the four configurable settings (contact phone + ShamCash payment info).
- Update the text settings; a blank value clears the setting.
- Upload / delete the union ShamCash QR image, stored as a base64 data URI.

Constraints
-----------
- The caller (router) owns the transaction; this module commits once per action
  after writing the paired audit-log row, so the change and its audit trail are
  committed atomically.
- Uploaded images are validated by magic bytes and a 1 MiB ceiling; nothing is
  trusted from the client-supplied content type.
"""

import base64

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.schemas.settings_admin import AdminSettingsUpdate
from app.services.audit_log import ActorType, record_audit
from app.services.settings_service import (
    CONTACT_PHONE,
    SHAMCASH_ACCOUNT_NUMBER,
    SHAMCASH_QR_IMAGE,
    SHAMCASH_RECEIVER_NAME,
    delete_setting,
    get_setting,
    set_setting,
)

_MAX_QR_BYTES = 1024 * 1024  # 1 MiB, matches messages.INVALID_IMAGE wording

_TEXT_FIELDS = {
    "contact_phone": CONTACT_PHONE,
    "shamcash_receiver_name": SHAMCASH_RECEIVER_NAME,
    "shamcash_account_number": SHAMCASH_ACCOUNT_NUMBER,
}


def _detect_mime(content: bytes) -> str | None:
    """Return the image MIME type inferred from magic bytes, or None."""
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(content) >= 12 and content[0:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


async def get_admin_settings_service(db: AsyncSession) -> dict:
    """Return every configurable setting (missing ones as None)."""
    return {
        "contact_phone": await get_setting(db, CONTACT_PHONE),
        "shamcash_receiver_name": await get_setting(db, SHAMCASH_RECEIVER_NAME),
        "shamcash_account_number": await get_setting(db, SHAMCASH_ACCOUNT_NUMBER),
        "shamcash_qr_image": await get_setting(db, SHAMCASH_QR_IMAGE),
    }


async def update_settings_service(
    db: AsyncSession, data: AdminSettingsUpdate, admin: dict
) -> dict:
    """Apply the provided text settings; blank values clear the setting."""
    provided = data.model_dump(exclude_unset=True)
    for field, key in _TEXT_FIELDS.items():
        if field not in provided:
            continue
        raw = provided[field]
        cleaned = raw.strip() if isinstance(raw, str) else raw
        if not cleaned:
            await delete_setting(db, key)
        else:
            await set_setting(db, key, cleaned)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "SETTINGS_UPDATED",
        "Settings",
        f"Updated fields: {', '.join(sorted(provided.keys())) or 'none'}",
    )
    await db.commit()

    return {
        "message": messages.SETTINGS_UPDATED,
        **(await get_admin_settings_service(db)),
    }


async def update_shamcash_qr_service(
    db: AsyncSession, content: bytes, admin: dict
) -> dict:
    """Validate and store the ShamCash QR image as a data URI (D12)."""
    if not content or len(content) > _MAX_QR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=messages.INVALID_IMAGE
        )
    mime = _detect_mime(content)
    if mime is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=messages.INVALID_IMAGE
        )

    encoded = base64.b64encode(content).decode("ascii")
    data_uri = f"data:{mime};base64,{encoded}"
    await set_setting(db, SHAMCASH_QR_IMAGE, data_uri)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "SHAMCASH_QR_UPDATED",
        "ShamCash QR",
        f"Stored {mime} image ({len(content)} bytes)",
    )
    await db.commit()

    return {"message": messages.SHAMCASH_QR_UPDATED, "shamcash_qr_image": data_uri}


async def delete_shamcash_qr_service(db: AsyncSession, admin: dict) -> dict:
    """Remove the stored ShamCash QR image."""
    await delete_setting(db, SHAMCASH_QR_IMAGE)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "SHAMCASH_QR_DELETED",
        "ShamCash QR",
        None,
    )
    await db.commit()

    return {"message": messages.SHAMCASH_QR_DELETED}
