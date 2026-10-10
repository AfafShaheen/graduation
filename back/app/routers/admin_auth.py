from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import security, get_current_admin
from app.schemas.admin_auth import AdminLoginRequest, AdminTokenResponse
from app.services.admin_auth_service import login_admin, logout_admin

router = APIRouter(prefix="/api/admin/auth", tags=["Admin Authentication"])

@router.post("/login", response_model=AdminTokenResponse, status_code=200)
async def login(data: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_admin(data, db)

@router.post("/logout", status_code=200)
async def logout(
    credentials = Depends(security),
    admin: dict = Depends(get_current_admin)
):
    return await logout_admin(credentials, admin)
