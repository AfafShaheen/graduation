from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional, List
from uuid import UUID

class AdminUpdateEmailRequest(BaseModel):
    new_email: EmailStr

class GraduateAdminResponse(BaseModel):
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
