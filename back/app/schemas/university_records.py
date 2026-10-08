from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List

class UniversityRecordUploadResponse(BaseModel):
    added: int
    updated: int
    skipped: int
    errors: List[str]

class UniversityRecordItem(BaseModel):
    id: int
    event_id: int
    university_id: str
    full_name: str
    father_name: str
    mother_name: str
    gender: str
    college_id: int
    imported_at: datetime
    model_config = ConfigDict(from_attributes=True)

class UniversityRecordListResponse(BaseModel):
    total: int
    items: List[UniversityRecordItem]
    model_config = ConfigDict(from_attributes=True)
