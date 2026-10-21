from pydantic import BaseModel, Field, ConfigDict, model_validator
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

class PackageItem(BaseModel):
    companions_count: int = Field(..., ge=2, le=10)
    price: Decimal = Field(..., ge=Decimal("0.00"))

class EventCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    event_date: date
    registration_start: datetime
    registration_end: datetime
    whatsapp_group_link: str
    packages: List[PackageItem] = Field(..., min_length=1)

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
    packages: Optional[List[PackageItem]] = None

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
    packages: List[PackageItem] = []
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
