from sqlalchemy import Column, Integer, SmallInteger, String, DateTime, ForeignKey, Enum, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base
import enum

class OtpPurposeEnum(str, enum.Enum):
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"

class OtpCodeModel(Base):
    __tablename__ = "otp_codes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    graduate_id = Column(Integer, ForeignKey("graduates.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose = Column(Enum(OtpPurposeEnum, name="otp_purpose"), nullable=False, index=True)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    failed_attempts = Column(SmallInteger, nullable=False, default=0)
    used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    graduate = relationship("GraduateModel", backref="otp_codes")

    __table_args__ = (
        CheckConstraint(
            "(used_at IS NULL) OR (used_at <= expires_at)",
            name="chk_otp_used_expired"
        ),
    )
