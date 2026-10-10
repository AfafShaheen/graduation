from pydantic import BaseModel, EmailStr, Field
from app.services.email_service import OtpPurpose

class VerifyOtpRequest(BaseModel):
    graduate_id: int
    code: str = Field(..., min_length=6, max_length=6)
    purpose: OtpPurpose = OtpPurpose.EMAIL_VERIFICATION

class ResendOtpRequest(BaseModel):
    graduate_id: int
    purpose: OtpPurpose = OtpPurpose.EMAIL_VERIFICATION

class ChangeEmailRequest(BaseModel):
    graduate_id: int
    new_email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters long.")

class GraduateLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)

class GraduateTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
