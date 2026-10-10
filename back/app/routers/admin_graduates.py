from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.admin_graduate import AdminUpdateEmailRequest
from app.services.admin_graduate_service import (
    search_graduates_service,
    get_graduate_full_details_service,
    admin_force_update_email_service,
    manual_check_in_service,
    revert_scan_service,
    revert_payment_service,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Graduate Management & Exceptional Actions"])

@router.get("/graduates", status_code=status.HTTP_200_OK)
async def search_graduates(
    search: str | None = Query(None),
    college_id: int | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await search_graduates_service(db, search, college_id, skip, limit)

@router.get("/graduates/{graduate_id}", status_code=status.HTTP_200_OK)
async def get_graduate_details(
    graduate_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await get_graduate_full_details_service(db, graduate_id)

@router.put("/graduates/{graduate_id}/email", status_code=status.HTTP_200_OK)
async def update_graduate_email(
    graduate_id: int,
    data: AdminUpdateEmailRequest,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await admin_force_update_email_service(db, graduate_id, data.new_email, admin)

@router.post("/graduates/{graduate_id}/manual-check-in", status_code=status.HTTP_200_OK)
async def manual_check_in(
    graduate_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await manual_check_in_service(db, graduate_id, admin)

@router.post("/graduates/{graduate_id}/revert-scan", status_code=status.HTTP_200_OK)
async def revert_scan(
    graduate_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await revert_scan_service(db, graduate_id, admin)

@router.post("/tickets/{ticket_id}/revert-payment", status_code=status.HTTP_200_OK)
async def revert_payment(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await revert_payment_service(db, ticket_id, admin)
