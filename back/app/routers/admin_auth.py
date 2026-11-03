from fastapi import APIRouter, Depends, Request
from app.services.login_throttle import client_ip
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import security, get_current_admin
from app.schemas.admin_auth import AdminLoginRequest, AdminTokenResponse, RefreshRequest
from app.services.admin_auth_service import login_admin, logout_admin, refresh_admin_session

router = APIRouter(prefix="/api/admin/auth", tags=["Admin Authentication"])

@router.post("/login", response_model=AdminTokenResponse, status_code=200)
async def login(data: AdminLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    return await login_admin(data, db, client_ip(request))

@router.post("/refresh", response_model=AdminTokenResponse, status_code=200)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await refresh_admin_session(data.refresh_token, db)

@router.post("/logout", status_code=200)
async def logout(
    credentials = Depends(security),
    admin: dict = Depends(get_current_admin)
):
    return await logout_admin(credentials, admin)
