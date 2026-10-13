import re
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.qr_code import QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum, TicketTypeEnum


class EventBrief(BaseModel):
    id: int
    name: str
    event_date: date
    model_config = ConfigDict(from_attributes=True)


class RegistrationInfo(BaseModel):
    is_open: bool
    start: Optional[datetime] = None
    end: Optional[datetime] = None


class TicketOption(BaseModel):
    ticket_type: TicketTypeEnum
    companions_count: int
    price: Decimal


class TicketOptionsResponse(BaseModel):
    event: EventBrief
    registration: RegistrationInfo
    has_ticket: bool
    info_text: str
    options: List[TicketOption]


class TicketSelectRequest(BaseModel):
    ticket_type: TicketTypeEnum
    confirm: bool = False
    model_config = ConfigDict(extra="forbid")


class TicketSummary(BaseModel):
    id: int
    status: TicketStatusEnum
    ticket_type: TicketTypeEnum
    companions_count: int
    price: Decimal
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class PaymentInfoResponse(BaseModel):
    amount: Decimal
    receiver_name: Optional[str] = None
    account_number: Optional[str] = None
    qr_image_url: Optional[str] = None
    note_instruction: str


class PaymentSubmitRequest(BaseModel):
    transaction_number: str
    amount: Decimal
    sender_name: str
    model_config = ConfigDict(extra="forbid")

    @field_validator("transaction_number")
    @classmethod
    def _normalize_transaction_number(cls, value: str) -> str:
        normalized = (value or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9-]{4,100}", normalized):
            raise ValueError("رقم العملية غير صالح")
        return normalized

    @field_validator("amount")
    @classmethod
    def _validate_amount(cls, value: Decimal) -> Decimal:
        if value is None or not value.is_finite() or value <= 0:
            raise ValueError("المبلغ غير صالح")
        try:
            quantized = value.quantize(Decimal("0.01"))
        except Exception:
            raise ValueError("المبلغ غير صالح")
        if quantized != value:
            raise ValueError("المبلغ غير صالح")
        if value >= Decimal("100000000"):
            raise ValueError("المبلغ غير صالح")
        return value

    @field_validator("sender_name")
    @classmethod
    def _validate_sender_name(cls, value: str) -> str:
        normalized = (value or "").strip()
        if not re.fullmatch(r"[\u0600-\u06FFa-zA-Z\s]{2,255}", normalized):
            raise ValueError("اسم المرسل غير صالح")
        return normalized


class PaymentSubmitResponse(BaseModel):
    status: str
    message: str


class QrCodeItem(BaseModel):
    id: int
    code_type: QrCodeTypeEnum
    code_value: str
    is_activated: bool
    scanned: bool


class PaymentRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255)


class MyTicketResponse(BaseModel):
    has_ticket: bool
    registration: RegistrationInfo
    ticket: Optional[TicketSummary] = None
    event: Optional[EventBrief] = None
    message: Optional[str] = None
    payment_info: Optional[PaymentInfoResponse] = None
    qr_codes: Optional[List[QrCodeItem]] = None
    whatsapp_group_link: Optional[str] = None
