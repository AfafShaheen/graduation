"""Access to the system settings table.

Keys are reused later by FR-21 (ShamCash payment info); only the contact
number is read now to build the generic verification/registration messages.
"""

from sqlalchemy import select
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
