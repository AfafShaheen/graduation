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
