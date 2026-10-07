from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    gender: str = Field(..., min_length=3, max_length=10)
    college_id: int
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=50)
    father_name: str = Field(..., min_length=2, max_length=255)
    mother_name: str = Field(..., min_length=2, max_length=255)
    password: str = Field(..., min_length=6)
    university_id: str = Field(..., min_length=1, max_length=100)

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    phone: Optional[str] = Field(None, min_length=5, max_length=50)
    father_name: Optional[str] = Field(None, min_length=2, max_length=255)
    mother_name: Optional[str] = Field(None, min_length=2, max_length=255)
    password: Optional[str] = Field(None, min_length=6)

class UserSoftDelete(BaseModel):
    is_active: bool = False

class UserResponse(BaseModel):
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
