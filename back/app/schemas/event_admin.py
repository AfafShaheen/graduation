import re
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator
from datetime import date, datetime, time
from decimal import Decimal
from typing import List, Optional

_SEAT_PREFIX_RE = re.compile(r"^[^\W\d_]{1,3}$", re.UNICODE)
_SEAT_PREFIX_ERROR = "بادئة المقاعد يجب أن تكون من 1 إلى 3 أحرف فقط دون أرقام أو رموز."


def _normalize_seat_prefix(value: Optional[str]) -> Optional[str]:
    """Treat a blank prefix as no prefix and fold Latin letters to uppercase."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "":
            return None
        return value.upper()
    return value


def _validate_seat_prefix(value: Optional[str]) -> Optional[str]:
    value = _normalize_seat_prefix(value)
    if value is not None and not _SEAT_PREFIX_RE.match(value):
        raise ValueError(_SEAT_PREFIX_ERROR)
    return value


class PackageItem(BaseModel):
    companions_count: int = Field(..., ge=2, le=10)
    price: Decimal = Field(..., ge=Decimal("0.00"))

class EventCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    event_date: date
    event_time: Optional[time] = None
    seat_prefix: Optional[str] = None
    registration_start: datetime
    registration_end: datetime
    whatsapp_group_link: str
    packages: List[PackageItem] = Field(..., min_length=1)
    college_names: List[str] = Field(..., min_items=1)

    @field_validator("seat_prefix")
    @classmethod
    def validate_seat_prefix(cls, value: Optional[str]) -> Optional[str]:
        return _validate_seat_prefix(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "EventCreate":
        if self.registration_end < self.registration_start:
            raise ValueError("تاريخ نهاية التسجيل يجب ألا يكون قبل تاريخ بداية التسجيل.")
        return self
    @model_validator(mode="after")
    def validate_packages(self) -> "EventCreate":
        counts = [p.companions_count for p in self.packages]
        if len(counts) != len(set(counts)):
            raise ValueError("لا يمكن تكرار عدد المرافقين في الباقات.")
        return self

class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    event_date: Optional[date] = None
    event_time: Optional[time] = None
    seat_prefix: Optional[str] = None
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    whatsapp_group_link: Optional[str] = None
    packages: Optional[List[PackageItem]] = None
    college_names: Optional[List[str]] = Field(None, min_items=1)

    @field_validator("seat_prefix")
    @classmethod
    def validate_seat_prefix(cls, value: Optional[str]) -> Optional[str]:
        return _validate_seat_prefix(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "EventUpdate":
        if self.registration_start and self.registration_end and self.registration_end < self.registration_start:
            raise ValueError("تاريخ نهاية التسجيل يجب ألا يكون قبل تاريخ بداية التسجيل.")
        return self

class CollegeItem(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

class EventResponse(BaseModel):
    id: int
    name: str
    event_date: date
    event_time: Optional[time] = None
    seat_prefix: Optional[str] = None
    registration_start: datetime
    registration_end: datetime
    whatsapp_group_link: str
    packages: List[PackageItem] = []
    created_at: datetime
    colleges: List[CollegeItem] = []
    model_config = ConfigDict(from_attributes=True)

class EventListResponse(BaseModel):
    total: int
    items: List[EventResponse]
    model_config = ConfigDict(from_attributes=True)
