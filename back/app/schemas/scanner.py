from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class ScannerCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long.")
    event_id: int = Field(..., gt=0)

class ScannerUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    password: Optional[str] = Field(None, min_length=8)
    event_id: Optional[int] = Field(None, gt=0)

class ScannerResponse(BaseModel):
    id: int
    username: str
    created_by_admin_id: int
    event_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
