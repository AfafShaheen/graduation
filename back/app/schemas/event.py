from pydantic import BaseModel, Field, ConfigDict
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

class EventCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    event_date: date
    registration_start: datetime
    registration_end: datetime
    whatsapp_group_link: str
    is_3companions_enabled: bool = True
    price_2_companions: Decimal = Field(..., ge=0)
    price_3_companions: Decimal = Field(..., ge=0)

class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    event_date: Optional[date] = None
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    whatsapp_group_link: Optional[str] = None
    is_3companions_enabled: Optional[bool] = None
    price_2_companions: Optional[Decimal] = Field(None, ge=0)
    price_3_companions: Optional[Decimal] = Field(None, ge=0)

class EventResponse(EventCreate):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
