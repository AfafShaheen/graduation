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


# --- Admin audit viewer (item 3.5.2) -----------------------------------------

class AuditActor(BaseModel):
    type: str
    id: int
    username: Optional[str] = None
    role_label: str


class AuditGraduate(BaseModel):
    id: int
    full_name: str
    university_id: str


class AuditLogItem(BaseModel):
    id: int
    created_at: datetime
    actor: AuditActor
    action: str
    action_label: str
    target: str
    details: Optional[str] = None
    event_id: Optional[int] = None
    ticket_id: Optional[int] = None
    graduate: Optional[AuditGraduate] = None


class AuditLogList(BaseModel):
    total: int
    items: list[AuditLogItem]
