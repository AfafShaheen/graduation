from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, UniqueConstraint, DateTime, Numeric, SmallInteger, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class GraduateModel(Base):
    __tablename__ = "graduates"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(String(255), nullable=False)
    first_name = Column(String(120), nullable=True)
    last_name = Column(String(120), nullable=True)
    gender = Column(String(10), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="RESTRICT"), nullable=False, index=True)
    major_id = Column(Integer, ForeignKey("majors.id", ondelete="RESTRICT"), nullable=True, index=True)
    gpa = Column(Numeric(precision=5, scale=2), nullable=True)
    top_rank = Column(SmallInteger, nullable=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone = Column(String(50), nullable=False)
    email_verified = Column(Boolean, nullable=False, default=False)
    father_name = Column(String(255), nullable=False)
    mother_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    university_id = Column(String(100), nullable=False, index=True)
    unique_graduate_code = Column(UUID(as_uuid=True), nullable=False, server_default=func.gen_random_uuid(), unique=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    college = relationship("CollegeModel", backref="graduates")
    major = relationship("MajorModel", backref="graduates")

    @property
    def major_name(self) -> str | None:
        return self.major.name if self.major else None

    __table_args__ = (
        UniqueConstraint("college_id", "university_id", name="unique_graduate_college_university"),
        CheckConstraint("gpa IS NULL OR (gpa >= 0 AND gpa <= 100)", name="chk_graduate_gpa_range"),
        CheckConstraint("top_rank IS NULL OR top_rank IN (1, 2, 3)", name="chk_graduate_top_rank"),
    )
