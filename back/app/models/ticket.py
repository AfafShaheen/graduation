from sqlalchemy import Column, Integer, SmallInteger, Text, ForeignKey, Numeric, DateTime, CheckConstraint, UniqueConstraint, Index, Enum, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base
import enum

class TicketStatusEnum(str, enum.Enum):
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    PROCESSING = "PROCESSING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"

class TicketModel(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    graduate_id = Column(Integer, ForeignKey("graduates.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    companions_count = Column(SmallInteger, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    status = Column(Enum(TicketStatusEnum, name="ticket_status"), nullable=False, default=TicketStatusEnum.AWAITING_PAYMENT, index=True)
    rejection_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True))
    seat_start = Column(Integer, nullable=True)

    graduate = relationship("GraduateModel", backref="tickets")
    event = relationship("EventModel", backref="tickets")

    __table_args__ = (
        CheckConstraint(
            "(status = 'CONFIRMED' AND confirmed_at IS NOT NULL) OR (status != 'CONFIRMED' AND confirmed_at IS NULL)",
            name="chk_ticket_confirmed_time"
        ),
        CheckConstraint(
            "seat_start IS NULL OR seat_start >= 1",
            name="chk_ticket_seat_start_positive"
        ),
        UniqueConstraint("graduate_id", "event_id", name="unique_ticket_graduate_event"),
        Index(
            "uq_tickets_event_seat_start",
            "event_id",
            "seat_start",
            unique=True,
            postgresql_where=text("seat_start IS NOT NULL"),
        ),
    )
