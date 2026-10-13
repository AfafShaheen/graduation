from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.settings_admin import AdminSettingsUpdate
from app.services.settings_admin_service import (
    delete_shamcash_qr_service,
    get_admin_settings_service,
    update_settings_service,
    update_shamcash_qr_service,
)

router = APIRouter(prefix="/api/admin/settings", tags=["Admin Settings"])


@router.get("", status_code=status.HTTP_200_OK)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await get_admin_settings_service(db)


@router.put("", status_code=status.HTTP_200_OK)
async def update_settings(
    data: AdminSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await update_settings_service(db, data, admin)


@router.put("/shamcash-qr", status_code=status.HTTP_200_OK)
async def update_shamcash_qr(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    content = await file.read()
    return await update_shamcash_qr_service(db, content, admin)


@router.delete("/shamcash-qr", status_code=status.HTTP_200_OK)
async def delete_shamcash_qr(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await delete_shamcash_qr_service(db, admin)
