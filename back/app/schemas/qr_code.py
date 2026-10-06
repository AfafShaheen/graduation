from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

class QrCodeCreate(BaseModel):
    ticket_id: int
    code_type: str = Field(..., description="GRADUATE or COMPANION")

class QrCodeUpdate(BaseModel):
    is_activated: Optional[bool] = None
    scanned_at: Optional[datetime] = None
    scanned_by_scanner_id: Optional[int] = None

class QrCodeResponse(BaseModel):
    id: int
    ticket_id: int
    code_type: str
    code_value: UUID
    is_activated: bool
    scanned_at: Optional[datetime] = None
    scanned_by_scanner_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)
