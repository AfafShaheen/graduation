from pydantic import BaseModel, Field, ConfigDict, model_validator
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
    price_2_companions: Decimal = Field(..., ge=Decimal("0.00"))
    price_3_companions: Decimal = Field(..., ge=Decimal("0.00"))

    @model_validator(mode="after")
    def validate_dates(self) -> "EventCreate":
        if self.registration_end < self.registration_start:
            raise ValueError("Registration end date cannot be before registration start date.")
        return self

class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    event_date: Optional[date] = None
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    whatsapp_group_link: Optional[str] = None
    is_3companions_enabled: Optional[bool] = None
    price_2_companions: Optional[Decimal] = Field(None, ge=Decimal("0.00"))
    price_3_companions: Optional[Decimal] = Field(None, ge=Decimal("0.00"))

    @model_validator(mode="after")
    def validate_dates(self) -> "EventUpdate":
        if self.registration_start and self.registration_end and self.registration_end < self.registration_start:
            raise ValueError("Registration end date cannot be before registration start date.")
        return self

class EventResponse(BaseModel):
    id: int
    name: str
    event_date: date
    registration_start: datetime
    registration_end: datetime
    whatsapp_group_link: str
    is_3companions_enabled: bool
    price_2_companions: Decimal
    price_3_companions: Decimal
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
