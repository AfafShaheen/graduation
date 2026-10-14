from sqlalchemy import Column, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import backref, relationship
from sqlalchemy.sql import func
from app.models.base import Base

class VolunteerAnswerModel(Base):
    __tablename__ = "volunteer_answers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    graduate_id = Column(
        Integer,
        ForeignKey("graduates.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    wants_responsibility = Column(Boolean, nullable=False)
    has_experience = Column(Boolean, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    graduate = relationship(
        "GraduateModel",
        backref=backref("volunteer_answer", cascade="all, delete-orphan"),
    )
