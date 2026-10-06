from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class UniversityRecordModel(Base):
    __tablename__ = "university_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    university_id = Column(String(100), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    father_name = Column(String(255), nullable=False)
    mother_name = Column(String(255), nullable=False)
    gender = Column(String(10), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="RESTRICT"), nullable=False, index=True)
    imported_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    event = relationship("EventModel", backref="university_records")
    college = relationship("CollegeModel", backref="university_records")

    __table_args__ = (
        UniqueConstraint("event_id", "university_id", name="unique_event_university_id"),
    )
