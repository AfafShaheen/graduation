from sqlalchemy import Column, Integer, Boolean, ForeignKey, DateTime, Enum, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base
import enum

class QrCodeTypeEnum(str, enum.Enum):
    GRADUATE = "GRADUATE"
    COMPANION = "COMPANION"

class QrCodeModel(Base):
    __tablename__ = "qr_codes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    code_type = Column(Enum(QrCodeTypeEnum, name="qr_code_type"), nullable=False, index=True)
    code_value = Column(UUID(as_uuid=True), nullable=False, server_default=func.gen_random_uuid(), unique=True, index=True)
    is_activated = Column(Boolean, nullable=False, default=False, index=True)
    scanned_at = Column(DateTime(timezone=True))
    scanned_by_scanner_id = Column(Integer, ForeignKey("scanners.id", ondelete="SET NULL"), index=True)

    ticket = relationship("TicketModel", backref="qr_codes")
    scanner = relationship("ScannerModel", backref="qr_codes_scanned")

    __table_args__ = (
        CheckConstraint(
            "(is_activated IS TRUE AND scanned_at IS NOT NULL AND scanned_by_scanner_id IS NOT NULL) OR (is_activated IS FALSE AND scanned_at IS NULL AND scanned_by_scanner_id IS NULL)",
            name="chk_qr_scanned_fields"
        ),
    )
