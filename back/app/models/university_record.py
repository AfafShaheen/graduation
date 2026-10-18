from sqlalchemy import Column, Integer, String, SmallInteger, ForeignKey, UniqueConstraint, DateTime, Numeric, Index, CheckConstraint, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class UniversityRecordModel(Base):
    __tablename__ = "university_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    university_id = Column(String(100), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    first_name = Column(String(120), nullable=True)
    last_name = Column(String(120), nullable=True)
    father_name = Column(String(255), nullable=False)
    mother_name = Column(String(255), nullable=False)
    gender = Column(String(10), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="RESTRICT"), nullable=False, index=True)
    major_id = Column(Integer, ForeignKey("majors.id", ondelete="RESTRICT"), nullable=True, index=True)
    gpa = Column(Numeric(precision=5, scale=2), nullable=True)
    top_rank_from_file = Column(SmallInteger, nullable=True)
    phone = Column(String(50), nullable=True)
    imported_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    event = relationship("EventModel", backref="university_records")
    college = relationship("CollegeModel", backref="university_records")
    major = relationship("MajorModel", backref="university_records")

    __table_args__ = (
        UniqueConstraint("event_id", "university_id", name="unique_event_university_id"),
        CheckConstraint("gpa IS NULL OR (gpa >= 0 AND gpa <= 100)", name="chk_uni_record_gpa_range"),
        CheckConstraint("top_rank_from_file IS NULL OR top_rank_from_file IN (-1, 0, 1, 2, 3)", name="chk_uni_records_top_from_file"),
        Index("idx_uni_records_ranking", "event_id", "college_id", "major_id", text("gpa DESC")),
    )
