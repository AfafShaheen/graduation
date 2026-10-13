from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.college import CollegeModel
from app.services.settings_service import (
    CONTACT_PHONE,
    SHAMCASH_ACCOUNT_NUMBER,
    SHAMCASH_QR_IMAGE,
    SHAMCASH_RECEIVER_NAME,
    get_setting,
)

router = APIRouter(prefix="/api", tags=["Public"])


@router.get("/colleges", status_code=status.HTTP_200_OK)
async def list_public_colleges(db: AsyncSession = Depends(get_db)):
    """Public college list for the registration form (FR-1, FR-3)."""
    result = await db.execute(select(CollegeModel).order_by(CollegeModel.name))
    colleges = result.scalars().all()
    return [{"id": c.id, "name": c.name} for c in colleges]


@router.get("/settings/public", status_code=status.HTTP_200_OK)
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Public contact number only; never exposes other settings (FR-2)."""
    contact_phone = await get_setting(db, CONTACT_PHONE)
    return {"contact_phone": contact_phone}


@router.get("/settings/shamcash-qr", status_code=status.HTTP_200_OK)
async def get_public_shamcash(db: AsyncSession = Depends(get_db)):
    """Public ShamCash payment info shown to the graduate (FR-21)."""
    return {
        "shamcash_qr_image": await get_setting(db, SHAMCASH_QR_IMAGE),
        "shamcash_receiver_name": await get_setting(db, SHAMCASH_RECEIVER_NAME),
        "shamcash_account_number": await get_setting(db, SHAMCASH_ACCOUNT_NUMBER),
    }
