from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from decimal import Decimal

class TicketCreate(BaseModel):
    graduate_id: int
    event_id: int
    ticket_type: str = Field(..., description="TWO_COMPANIONS or THREE_COMPANIONS")
    companions_count: int = Field(..., ge=2, le=3)
    price: Decimal = Field(..., ge=0)

class TicketUpdate(BaseModel):
    status: Optional[str] = None
    rejection_reason: Optional[str] = None

class TicketResponse(TicketCreate):
    id: int
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
