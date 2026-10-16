from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Literal
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
    major_id: Optional[int] = None
    major_name: Optional[str] = None
    gpa: Optional[str] = None
    top_rank: Optional[int] = None
    wants_responsibility: Optional[Literal["yes", "no"]] = None
    has_experience: Optional[Literal["yes", "no"]] = None
    volunteer_answered: bool = False
    model_config = ConfigDict(from_attributes=True)
