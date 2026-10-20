from fastapi import APIRouter, Depends, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.university_files import (
    UniversityFileListResponse,
    UniversityFileLinkRequest,
)
from app.services.university_files_service import (
    list_university_files,
    upload_university_file,
    link_university_file,
    delete_university_file,
)

router = APIRouter(prefix="/api/admin", tags=["Admin University Data Files"])


@router.get("/university-files", response_model=UniversityFileListResponse, status_code=status.HTTP_200_OK)
async def get_files(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await list_university_files(db)


@router.post("/university-files", status_code=status.HTTP_200_OK)
async def upload_file(
    file: UploadFile = File(...),
    event_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await upload_university_file(file, event_id, admin, db)


@router.post("/university-files/{file_id}/link", status_code=status.HTTP_200_OK)
async def link_file(
    file_id: int,
    payload: UniversityFileLinkRequest,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await link_university_file(file_id, payload.event_id, admin, db)


@router.delete("/university-files/{file_id}", status_code=status.HTTP_200_OK)
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await delete_university_file(file_id, admin, db)
