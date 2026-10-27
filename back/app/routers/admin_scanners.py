from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.scanner import ScannerCreate, ScannerResponse
from app.services.scanner_service import (
    create_scanner_service,
    delete_scanner_service,
    list_scanners_service,
)

router = APIRouter(prefix="/api/admin/scanners", tags=["Admin Scanners"])


@router.post("", response_model=ScannerResponse, status_code=status.HTTP_201_CREATED)
async def create_scanner(
    data: ScannerCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await create_scanner_service(db, data, admin)


@router.get("", response_model=list[ScannerResponse], status_code=status.HTTP_200_OK)
async def list_scanners(
    event_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await list_scanners_service(db, event_id)


@router.delete("/{scanner_id}", status_code=status.HTTP_200_OK)
async def delete_scanner(
    scanner_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await delete_scanner_service(db, scanner_id, admin)
