from sqlalchemy import Column, Integer, String, Date, DateTime, Time, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class EventModel(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    event_date = Column(Date, nullable=False, index=True)
    event_time = Column(Time, nullable=True)
    seat_prefix = Column(String(3), nullable=True)
    registration_start = Column(DateTime(timezone=True), nullable=False)
    registration_end = Column(DateTime(timezone=True), nullable=False)
    whatsapp_group_link = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    college_links = relationship(
        "EventCollegeModel",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    colleges = relationship(
        "CollegeModel",
        secondary="event_colleges",
        viewonly=True,
        back_populates="events",
    )
    packages = relationship(
        "EventTicketPackageModel",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="EventTicketPackageModel.companions_count",
    )

    __table_args__ = (
        CheckConstraint("registration_start <= registration_end", name="chk_event_registration_period"),
    )
