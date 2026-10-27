from sqlalchemy import Column, Integer, String, Text, DateTime, Enum
from sqlalchemy.sql import func
from app.models.base import Base
import enum

class ActorTypeEnum(str, enum.Enum):
    ADMIN = "ADMIN"
    SCANNER = "SCANNER"

class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    actor_type = Column(Enum(ActorTypeEnum, name="actor_type"), nullable=False)
    actor_id = Column(Integer, nullable=False)
    action = Column(String(255), nullable=False, index=True)
    target = Column(String(255), nullable=False, index=True)
    details = Column(Text)
    # Structured references (D21): plain integers without foreign keys so the
    # audit row survives deletion of the event / graduate / ticket it points to.
    event_id = Column(Integer, nullable=True, index=True)
    graduate_id = Column(Integer, nullable=True, index=True)
    ticket_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
