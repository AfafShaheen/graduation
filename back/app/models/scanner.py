from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class ScannerModel(Base):
    __tablename__ = "scanners"
    __table_args__ = (
        UniqueConstraint("username", "event_id", name="uq_scanners_username_event"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_by_admin_id = Column(Integer, ForeignKey("admins.id", ondelete="RESTRICT"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    admin = relationship("AdminModel", backref="scanners")
    event = relationship("EventModel", backref="scanners")
