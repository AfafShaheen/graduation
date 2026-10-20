from sqlalchemy import Column, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base


class CollegeModel(Base):
    """Global college catalog entry (reusable across events, P5).

    Which events a college participates in lives in ``event_colleges``.
    """

    __tablename__ = "colleges"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)

    event_links = relationship(
        "EventCollegeModel",
        back_populates="college",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    majors = relationship(
        "MajorModel",
        back_populates="college",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    events = relationship(
        "EventModel",
        secondary="event_colleges",
        viewonly=True,
        back_populates="colleges",
    )

    __table_args__ = (
        UniqueConstraint("name", name="unique_college_name"),
    )
