"""Scanner-facing endpoints: login, logout and the unified scan (FR-23/24/25)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_scanner, security
from app.models.scanner import ScannerModel
from app.schemas.scanner_auth import (
    ScanRequest,
    ScanResponse,
    ScannerLoginRequest,
    ScannerTokenResponse,
)
from app.services.scan_service import scan_service
from app.services.scanner_auth_service import login_scanner, logout_scanner

router = APIRouter(prefix="/api/scanner", tags=["Scanner"])


@router.post(
    "/auth/login",
    response_model=ScannerTokenResponse,
    status_code=status.HTTP_200_OK,
)
async def login(data: ScannerLoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_scanner(data, db)


@router.post("/auth/logout", status_code=status.HTTP_200_OK)
async def logout(
    credentials=Depends(security),
    scanner: ScannerModel = Depends(get_current_scanner),
):
    return await logout_scanner(credentials, scanner)


@router.post("/scan", response_model=ScanResponse, status_code=status.HTTP_200_OK)
async def scan(
    data: ScanRequest,
    scanner: ScannerModel = Depends(get_current_scanner),
    db: AsyncSession = Depends(get_db),
):
    return await scan_service(db, data.code, scanner)
