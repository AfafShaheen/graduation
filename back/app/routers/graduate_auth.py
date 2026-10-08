from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import security, get_current_graduate
from app.schemas.auth import GraduateLoginRequest, GraduateTokenResponse
from app.services.graduate_auth_service import login_graduate, logout_graduate
from app.models.graduate import GraduateModel

router = APIRouter(prefix="/api/auth/graduate", tags=["Graduate Authentication"])

@router.post("/login", response_model=GraduateTokenResponse, status_code=status.HTTP_200_OK)
async def login(data: GraduateLoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_graduate(data, db)

@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    credentials = Depends(security),
    current_graduate: GraduateModel = Depends(get_current_graduate)
):
    return await logout_graduate(credentials, current_graduate)
