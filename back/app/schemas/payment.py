from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from decimal import Decimal

class PaymentCreate(BaseModel):
    ticket_id: int
    transaction_number: str = Field(..., min_length=1, max_length=100)
    amount: Decimal = Field(..., ge=0)
    sender_name: str = Field(..., min_length=2, max_length=255)

class PaymentUpdate(BaseModel):
    reviewed_at: Optional[datetime] = None

class PaymentResponse(PaymentCreate):
    id: int
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
