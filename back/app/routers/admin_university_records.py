from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.university_records import (
    UniversityRecordUploadResponse,
    UniversityRecordListResponse,
)
from app.services.university_records_service import (
    upload_university_records,
    list_university_records,
    delete_university_record,
)

router = APIRouter(prefix="/api/admin", tags=["Admin University Records & FR-15"])

@router.post("/events/{event_id}/university-records", response_model=UniversityRecordUploadResponse, status_code=status.HTTP_200_OK)
async def upload_records(
    event_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await upload_university_records(file, event_id, admin, db)

@router.get("/events/{event_id}/university-records", response_model=UniversityRecordListResponse, status_code=status.HTTP_200_OK)
async def get_records(
    event_id: int,
    search: str | None = Query(None),
    college_id: int | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await list_university_records(event_id, search, college_id, skip, limit, db)

@router.delete("/university-records/{record_id}", status_code=status.HTTP_200_OK)
async def delete_record(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await delete_university_record(record_id, admin, db)
