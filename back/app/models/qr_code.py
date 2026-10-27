from sqlalchemy import Column, Integer, Boolean, ForeignKey, DateTime, Enum, CheckConstraint, Index, text
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
            "scanned_at IS NULL OR is_activated",
            name="chk_qr_scanned_at_requires_activation",
        ),
        CheckConstraint(
            "scanned_by_scanner_id IS NULL OR scanned_at IS NOT NULL",
            name="chk_qr_scanned_by_requires_scanned_at",
        ),
        Index(
            "uq_qr_codes_graduate_ticket",
            "ticket_id",
            unique=True,
            postgresql_where=text("code_type = 'GRADUATE'"),
        ),
    )
