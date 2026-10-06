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
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
