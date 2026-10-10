from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

NAME_REGEX = r"^[\u0600-\u06FFa-zA-Z\s]{2,255}$"
PHONE_REGEX = r"^\+?[0-9]{7,15}$"

class UserVerifyStep1(BaseModel):
    college_id: int = Field(..., gt=0)
    university_id: str = Field(..., min_length=1, max_length=100)
    full_name: str = Field(..., pattern=NAME_REGEX, description="Full name must contain letters only.")
    father_name: str = Field(..., pattern=NAME_REGEX, description="Father's name must contain letters only.")
    mother_name: str = Field(..., pattern=NAME_REGEX, description="Mother's name must contain letters only.")
    gender: str = Field(..., min_length=3, max_length=10)

class RegisterStep2Request(BaseModel):
    registration_token: str
    email: EmailStr
    phone: str = Field(..., pattern=PHONE_REGEX, description="Phone number must contain digits only.")
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long.")

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, pattern=NAME_REGEX, description="Full name must contain letters only.")
    phone: Optional[str] = Field(None, pattern=PHONE_REGEX, description="Phone number must contain digits only.")
    father_name: Optional[str] = Field(None, pattern=NAME_REGEX, description="Father's name must contain letters only.")
    mother_name: Optional[str] = Field(None, pattern=NAME_REGEX, description="Mother's name must contain letters only.")
    password: Optional[str] = Field(None, min_length=8, description="Password must be at least 8 characters long.")

class GraduateUpdateSelf(BaseModel):
    phone: Optional[str] = Field(None, pattern=PHONE_REGEX)
    father_name: Optional[str] = Field(None, pattern=NAME_REGEX)
    mother_name: Optional[str] = Field(None, pattern=NAME_REGEX)

class GraduateUpdateAdmin(BaseModel):
    email_verified: Optional[bool] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None

class GraduateResponse(BaseModel):
    id: int
    full_name: str
    gender: str
    college_id: int
    email: EmailStr
    phone: str
    email_verified: bool
    father_name: str
    mother_name: str
    university_id: str
    unique_graduate_code: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
