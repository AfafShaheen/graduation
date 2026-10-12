from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_verification_graduate_id
from app.schemas.auth import (
    VerifyOtpRequest,
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
from app.services.email_service import OtpPurpose

router = APIRouter(prefix="/api/auth", tags=["Auth & OTP"])


@router.post("/verify-otp")
async def verify_otp_endpoint(
    data: VerifyOtpRequest,
    db: AsyncSession = Depends(get_db),
    graduate_id: int = Depends(get_verification_graduate_id),
):
    return await verify_otp_service(db, graduate_id, data.code, OtpPurpose.EMAIL_VERIFICATION)


@router.post("/resend-otp")
async def resend_otp_endpoint(
    db: AsyncSession = Depends(get_db),
    graduate_id: int = Depends(get_verification_graduate_id),
):
    return await resend_otp_service(db, graduate_id, OtpPurpose.EMAIL_VERIFICATION)


@router.post("/change-email")
async def change_email_endpoint(
    data: ChangeEmailRequest,
    db: AsyncSession = Depends(get_db),
    graduate_id: int = Depends(get_verification_graduate_id),
):
    return await change_email_service(db, graduate_id, data.new_email)


@router.post("/forgot-password")
async def forgot_password_endpoint(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    return await forgot_password_service(db, data.email)


@router.post("/reset-password")
async def reset_password_endpoint(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    return await reset_password_service(db, data.email, data.code, data.new_password)
