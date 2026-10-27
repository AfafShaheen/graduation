from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator
from datetime import datetime
from typing import Optional, Literal
from decimal import Decimal
from uuid import UUID

from app.core.security import validate_password_policy

NAME_REGEX = r"^[\u0600-\u06FFa-zA-Z\s]{2,255}$"
PHONE_REGEX = r"^\+?[0-9]{7,15}$"

class UserVerifyStep1(BaseModel):
    college_id: int = Field(..., gt=0)
    university_id: str = Field(..., min_length=1, max_length=100)
    first_name: Optional[str] = Field(None, pattern=NAME_REGEX, description="First name (الاسم), letters only.")
    last_name: Optional[str] = Field(None, pattern=NAME_REGEX, description="Surname (الكنية), letters only.")
    full_name: str = Field(None, pattern=NAME_REGEX, description="Legacy single name field; kept for backwards compatibility (D4).")
    father_name: str = Field(..., pattern=NAME_REGEX, description="Father's name must contain letters only.")
    mother_name: str = Field(..., pattern=NAME_REGEX, description="Mother's name must contain letters only.")
    gender: str = Field(..., min_length=3, max_length=10)
    major_id: Optional[int] = Field(None, gt=0)
    gpa: Optional[Decimal] = Field(None, ge=0, le=100, max_digits=5, decimal_places=2)
    top_rank: Optional[Literal[1, 2, 3]] = None

    @model_validator(mode="after")
    def _require_a_name(self):
        # Either the split names (first + last) or the legacy full name (D4).
        has_split = bool(self.first_name) and bool(self.last_name)
        if not has_split and not self.full_name:
            raise ValueError("يجب إدخال الاسم والكنية أو الاسم الكامل.")
        return self

class RegisterStep2Request(BaseModel):
    registration_token: str
    email: EmailStr
    phone: str = Field(..., pattern=PHONE_REGEX, description="Phone number must contain digits only.")
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long.")

    @model_validator(mode="after")
    def _enforce_password_policy(self):
        validate_password_policy(self.password)
        return self

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
    major_id: Optional[int] = None
    major_name: Optional[str] = None
    gpa: Optional[Decimal] = None
    top_rank: Optional[int] = None
    model_config = ConfigDict(from_attributes=True, arbitrary_types_allowed=True)

class GraduateMeResponse(BaseModel):
    full_name: str
    university_id: str
    college_name: str
    major_name: Optional[str] = None
    gpa: Optional[Decimal] = None
    top_rank: Optional[int] = None
    unique_graduate_code: UUID
    model_config = ConfigDict(from_attributes=True, arbitrary_types_allowed=True)
