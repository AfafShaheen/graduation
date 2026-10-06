from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class UniversityRecordCreate(BaseModel):
    event_id: int
    university_id: str = Field(..., min_length=1, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=255)
    father_name: str = Field(..., min_length=2, max_length=255)
    mother_name: str = Field(..., min_length=2, max_length=255)
    gender: str = Field(..., min_length=3, max_length=10)
    college_id: int

class UniversityRecordUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    father_name: Optional[str] = Field(None, min_length=2, max_length=255)
    mother_name: Optional[str] = Field(None, min_length=2, max_length=255)
    gender: Optional[str] = Field(None, min_length=3, max_length=10)
    college_id: Optional[int] = None

class UniversityRecordResponse(UniversityRecordCreate):
    id: int
    imported_at: datetime
    model_config = ConfigDict(from_attributes=True)
