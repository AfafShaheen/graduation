import re

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, List, Literal
from uuid import UUID

from app.core.names import clean_typed_name

class AdminUpdateEmailRequest(BaseModel):
    new_email: EmailStr


_ARABIC_NAME = re.compile(r"^[\u0621-\u063A\u0641-\u064A ]{2,100}$")


class AdminUpdateNameRequest(BaseModel):
    """The four names of a graduate, exactly as they should be printed."""

    first_name: str
    last_name: str
    father_name: str
    mother_name: str

    @field_validator("first_name", "last_name", "father_name", "mother_name", mode="before")
    @classmethod
    def _clean(cls, value):
        return clean_typed_name(value) if isinstance(value, str) else value

    @field_validator("first_name", "last_name", "father_name", "mother_name")
    @classmethod
    def _arabic_letters_only(cls, value: str) -> str:
        if not _ARABIC_NAME.fullmatch(value):
            raise ValueError("يجب أن يحتوي الاسم على حروف عربية ومسافات فقط (حرفان على الأقل).")
        return value

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
