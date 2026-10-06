from sqlalchemy import Column, Integer, SmallInteger, Text, ForeignKey, Numeric, DateTime, CheckConstraint, UniqueConstraint, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base
import enum

class TicketStatusEnum(str, enum.Enum):
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    PROCESSING = "PROCESSING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"

class TicketTypeEnum(str, enum.Enum):
    TWO_COMPANIONS = "TWO_COMPANIONS"
    THREE_COMPANIONS = "THREE_COMPANIONS"

class TicketModel(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    graduate_id = Column(Integer, ForeignKey("graduates.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_type = Column(Enum(TicketTypeEnum, name="ticket_type"), nullable=False)
    companions_count = Column(SmallInteger, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    status = Column(Enum(TicketStatusEnum, name="ticket_status"), nullable=False, default=TicketStatusEnum.AWAITING_PAYMENT, index=True)
    rejection_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True))

    graduate = relationship("GraduateModel", backref="tickets")
    event = relationship("EventModel", backref="tickets")

    __table_args__ = (
        CheckConstraint(
            "(ticket_type = 'TWO_COMPANIONS' AND companions_count = 2) OR (ticket_type = 'THREE_COMPANIONS' AND companions_count = 3)",
            name="chk_ticket_companions_count"
        ),
        CheckConstraint(
            "(status = 'CONFIRMED' AND confirmed_at IS NOT NULL) OR (status != 'CONFIRMED' AND confirmed_at IS NULL)",
            name="chk_ticket_confirmed_time"
        ),
        UniqueConstraint("graduate_id", "event_id", name="unique_ticket_graduate_event"),
    )
