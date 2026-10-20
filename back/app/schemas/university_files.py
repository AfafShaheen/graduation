from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional

class UniversityFileCollegeItem(BaseModel):
    college_id: int
    name: str
    rows: int

class UniversityFileItem(BaseModel):
    id: int
    event_id: Optional[int] = None
    event_name: Optional[str] = None
    original_name: str
    size_bytes: Optional[int] = None
    rows_total: int
    rows_imported: int
    rows_updated: int
    rows_skipped: int
    status: str
    colleges: List[UniversityFileCollegeItem] = []
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class UniversityFileListResponse(BaseModel):
    total: int
    items: List[UniversityFileItem]

class UniversityFileLinkRequest(BaseModel):
    event_id: int
