from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.major import MajorCreate, MajorUpdate, MajorAdminResponse
from app.services.major_service import (
    list_college_majors_service,
    create_major_service,
    update_major_service,
    delete_major_service,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Majors Management"])

@router.get("/colleges/{college_id}/majors", response_model=list[MajorAdminResponse], status_code=status.HTTP_200_OK)
async def list_college_majors(
    college_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await list_college_majors_service(db, college_id)

@router.post("/colleges/{college_id}/majors", response_model=MajorAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_major(
    college_id: int,
    data: MajorCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await create_major_service(db, college_id, data, admin)

@router.put("/majors/{major_id}", response_model=MajorAdminResponse, status_code=status.HTTP_200_OK)
async def update_major(
    major_id: int,
    data: MajorUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await update_major_service(db, major_id, data, admin)

@router.delete("/majors/{major_id}", status_code=status.HTTP_200_OK)
async def delete_major(
    major_id: int,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    return await delete_major_service(db, major_id, admin)
