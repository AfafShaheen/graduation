from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.security import validate_password_policy

class VerifyOtpRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)

class ResendOtpRequest(BaseModel):
    pass

class ChangeEmailRequest(BaseModel):
    new_email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters long.")


    @model_validator(mode="after")
    def _enforce_password_policy(self):
        validate_password_policy(self.new_password)
        return self

class GraduateLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)

class GraduateTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    refresh_expires_in: int

class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)
