from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class OtpCodeCreate(BaseModel):
    graduate_id: int
    purpose: str
    code_hash: str
    expires_at: datetime

class OtpCodeUpdate(BaseModel):
    failed_attempts: Optional[int] = None
    used_at: Optional[datetime] = None

class OtpCodeResponse(OtpCodeCreate):
    id: int
    failed_attempts: int
    used_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
