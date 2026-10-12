from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.graduate import UserVerifyStep1, RegisterStep2Request
from app.services.graduate_service import (
    verify_step1_service,
    register_step2_service,
)

router = APIRouter(prefix="/api/graduates", tags=["Graduates & Registration"])

@router.post("/verify-step1", status_code=status.HTTP_200_OK)
async def verify_step1_endpoint(data: UserVerifyStep1, db: AsyncSession = Depends(get_db)):
    return await verify_step1_service(db, data)

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_step2_endpoint(data: RegisterStep2Request, db: AsyncSession = Depends(get_db)):
    return await register_step2_service(db, data)
