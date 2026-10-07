from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean, Numeric, CheckConstraint
from sqlalchemy.sql import func
from app.models.base import Base

class EventModel(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    event_date = Column(Date, nullable=False, index=True)
    registration_start = Column(DateTime(timezone=True), nullable=False)
    registration_end = Column(DateTime(timezone=True), nullable=False)
    whatsapp_group_link = Column(String, nullable=False)
    is_3companions_enabled = Column(Boolean, nullable=False, default=True)
    price_2_companions = Column(Numeric(10, 2), nullable=False)
    price_3_companions = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("registration_start <= registration_end", name="chk_event_registration_period"),
        CheckConstraint("price_2_companions >= 0 AND price_3_companions >= 0", name="chk_event_prices_positive"),
    )
