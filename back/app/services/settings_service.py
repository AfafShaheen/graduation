"""Access to the system settings table.

Keys are reused later by FR-21 (ShamCash payment info); only the contact
number is read now to build the generic verification/registration messages.
"""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import SettingModel

CONTACT_PHONE = "contact_phone"
SHAMCASH_QR_IMAGE = "shamcash_qr_image"
SHAMCASH_RECEIVER_NAME = "shamcash_receiver_name"
SHAMCASH_ACCOUNT_NUMBER = "shamcash_account_number"


async def get_setting(db: AsyncSession, key: str) -> str | None:
    """Return the stored value for a setting key, or None when it is missing."""
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    """Insert or update a setting value (no commit; caller owns the transaction)."""
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    row = result.scalar_one_or_none()
    if row is None:
        db.add(SettingModel(key=key, value=value))
    else:
        row.value = value


async def delete_setting(db: AsyncSession, key: str) -> None:
    """Remove a setting row when present (no commit; caller owns the transaction)."""
    await db.execute(delete(SettingModel).where(SettingModel.key == key))
