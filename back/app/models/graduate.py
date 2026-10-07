from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class GraduateModel(Base):
    __tablename__ = "graduates"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(String(255), nullable=False)
    gender = Column(String(10), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="RESTRICT"), nullable=False, index=True)
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

    __table_args__ = (
        UniqueConstraint("college_id", "university_id", name="unique_graduate_college_university"),
    )
