from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional

class UniversityRecordDiagnosticRequest(BaseModel):
    university_id: str
    college_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    gender: Optional[str] = None
    major_id: Optional[int] = None

class UniversityRecordUploadSummary(BaseModel):
    total: int
    added: int
    updated: int
    skipped: int
    error_count: int

class UniversityRecordUploadError(BaseModel):
    row: int
    field: str
    message: str

class UniversityRecordUploadResponse(BaseModel):
    added: int
    updated: int
    skipped: int
    errors: List[UniversityRecordUploadError]
    summary: Optional[UniversityRecordUploadSummary] = None

class UniversityRecordItem(BaseModel):
    id: int
    event_id: int
    university_id: str
    full_name: str
    father_name: str
    mother_name: str
    gender: str
    college_id: int
    major_id: Optional[int] = None
    major_name: Optional[str] = None
    gpa: Optional[str] = None
    imported_at: datetime
    model_config = ConfigDict(from_attributes=True)

class UniversityRecordListResponse(BaseModel):
    total: int
    items: List[UniversityRecordItem]
    model_config = ConfigDict(from_attributes=True)

class DiagnosticField(BaseModel):
    field: str
    label: str
    expected: Optional[str] = None
    provided: Optional[str] = None
    matches: bool

class DiagnosticRecord(BaseModel):
    record_id: int
    event_id: int
    university_id: str
    full_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    father_name: str
    mother_name: str
    gender: str
    college_id: int
    college_name: Optional[str] = None
    major_id: Optional[int] = None
    major_name: Optional[str] = None
    gpa: Optional[str] = None
    top_rank_from_file: Optional[int] = None
    phone: Optional[str] = None
    imported_at: datetime

class UniversityRecordDiagnosticResponse(BaseModel):
    found: bool
    record: Optional[DiagnosticRecord] = None
    fields: List[DiagnosticField] = []
    mismatches: List[str] = []
    already_registered: bool = False
    message: Optional[str] = None
