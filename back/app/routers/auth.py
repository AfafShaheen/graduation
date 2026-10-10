from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.auth import (
    VerifyOtpRequest,
    ResendOtpRequest,
    ChangeEmailRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.services.auth_service import (
    verify_otp_service,
    resend_otp_service,
    change_email_service,
    forgot_password_service,
    reset_password_service,
)

router = APIRouter(prefix="/api/auth", tags=["Auth & OTP"])

@router.post("/verify-otp")
async def verify_otp_endpoint(data: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    return await verify_otp_service(db, data.graduate_id, data.code, data.purpose)

@router.post("/resend-otp")
async def resend_otp_endpoint(data: ResendOtpRequest, db: AsyncSession = Depends(get_db)):
    return await resend_otp_service(db, data.graduate_id, data.purpose)

@router.post("/change-email")
async def change_email_endpoint(data: ChangeEmailRequest, db: AsyncSession = Depends(get_db)):
    return await change_email_service(db, data.graduate_id, data.new_email)

@router.post("/forgot-password")
async def forgot_password_endpoint(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    return await forgot_password_service(db, data.email)

@router.post("/reset-password")
async def reset_password_endpoint(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    return await reset_password_service(db, data.email, data.code, data.new_password)
