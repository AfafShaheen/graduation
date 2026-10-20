from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.orm import relationship
from app.models.base import Base


class EventCollegeModel(Base):
    """Link table: a college catalog entry may be reused by several events.

    Each link is validated against overlapping registration windows
    (P5.3), so a given college resolves to at most one event at a time.
    """

    __tablename__ = "event_colleges"

    event_id = Column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        primary_key=True,
    )
    college_id = Column(
        Integer,
        ForeignKey("colleges.id", ondelete="CASCADE"),
        primary_key=True,
    )

    event = relationship("EventModel", back_populates="college_links")
    college = relationship("CollegeModel", back_populates="event_links")
