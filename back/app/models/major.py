from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base

class MajorModel(Base):
    __tablename__ = "majors"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, index=True)

    college = relationship("CollegeModel", back_populates="majors")

    __table_args__ = (
        UniqueConstraint("college_id", "name", name="unique_major_name_per_college"),
    )
