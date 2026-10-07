from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class AuditLogCreate(BaseModel):
    actor_type: str
    actor_id: int
    action: str = Field(..., min_length=1, max_length=255)
    target: str = Field(..., min_length=1, max_length=255)
    details: Optional[str] = None

class AuditLogResponse(AuditLogCreate):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
