from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.event_admin import EventCreate, EventUpdate, EventResponse, EventListResponse
from app.services.event_service import (
    create_event_service,
    list_events_service,
    get_event_details_service,
    update_event_service,
    delete_event_service,
)

router = APIRouter(prefix="/api/admin/events", tags=["Admin Events & Colleges Management"])

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await create_event_service(db, data, admin)

@router.get("", response_model=EventListResponse, status_code=status.HTTP_200_OK)
async def list_events(
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await list_events_service(db, search, skip, limit, active_only)

@router.get("/{event_id}", response_model=EventResponse, status_code=status.HTTP_200_OK)
async def get_event_details(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await get_event_details_service(db, event_id)

@router.put("/{event_id}", status_code=status.HTTP_200_OK)
async def update_event(
    event_id: int,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await update_event_service(db, event_id, data, admin)

@router.delete("/{event_id}", status_code=status.HTTP_200_OK)
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await delete_event_service(db, event_id, admin)
