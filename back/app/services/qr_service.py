"""Shared helpers for QR code value generation, companion activation, and secure scanning.

Constraints:
- No database connections are created here; the caller passes a live session.
- Uses row-level locking (.with_for_update()) to prevent race conditions during concurrent scans (FR-25 / UC-11).
- The caller owns the transaction and commits.
"""

import enum
import secrets
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, Integer, MetaData, Table, Text, update, select
from sqlalchemy.orm import Session
from app.models.qr_code import QrCodeModel


class QrCodeType(str, enum.Enum):
    GRADUATE = "GRADUATE"
    COMPANION = "COMPANION"


_metadata = MetaData()

qr_codes = Table(
    "qr_codes",
    _metadata,
    Column("id", Integer, primary_key=True),
    Column("ticket_id", Integer, nullable=False),
    Column("code_type", Text, nullable=False),
    Column("code_value", Text, unique=True, nullable=False),
    Column("is_activated", Boolean, nullable=False, default=False),
)


def generate_code_value() -> str:
    """Return an unguessable, non-sequential UUIDv4 value as 32-char lowercase hex.

    Uses a cryptographically strong source (``secrets``), not a sequential counter.
    Format: 16 random bytes with UUID version 4 and RFC 4122 variant bits set.
    """
    raw = bytearray(secrets.token_bytes(16))
    raw[6] = (raw[6] & 0x0F) | 0x40
    raw[8] = (raw[8] & 0x3F) | 0x80
    return raw.hex()


def activate_companion_codes(db: Session, ticket_id: int) -> int:
    """Activate all not-yet-active COMPANION codes of a ticket.

    Designed for UC-12: run right after the graduate's QR is scanned.
    Idempotent: codes already activated are left untouched.
    Only flips ``is_activated``; never touches ``scanned_at`` / ``scanned_by_scanner_id``.
    Returns the number of codes activated.
    """
    result = db.execute(
        update(qr_codes)
        .where(
            qr_codes.c.ticket_id == ticket_id,
            qr_codes.c.code_type == QrCodeType.COMPANION.value,
            qr_codes.c.is_activated.is_(False),
        )
        .values(is_activated=True)
    )
    db.flush()
    return result.rowcount


def scan_qr_code(db: Session, code_value, scanner_id: int) -> dict:
    """Scan and activate a QR code using row-level locking (.with_for_update()).

    This is the core implementation for FR-25 and UC-11, ensuring that no two
    scanners can scan the exact same QR code simultaneously.
    """
    # Select For Update: locks this row in the database until the transaction completes.
    qr_record = db.execute(
        select(QrCodeModel)
        .where(QrCodeModel.code_value == code_value)
        .with_for_update()
    ).scalar_one_or_none()

    if qr_record is None:
        return {"status": "not_found", "message": "الرمز غير معروف"}

    if qr_record.is_activated:
        return {"status": "already_used", "message": "رمز مستخدم سابقاً"}

    now = datetime.now(UTC)
    qr_record.is_activated = True
    qr_record.scanned_at = now
    qr_record.scanned_by_scanner_id = scanner_id

    # If it's a graduate code, activate companion codes (UC-12)
    if qr_record.code_type == QrCodeTypeEnum.GRADUATE.value if hasattr(QrCodeTypeEnum, "GRADUATE") else qr_record.code_type == "GRADUATE":
        activate_companion_codes(db, qr_record.ticket_id)

    db.flush()
    return {"status": "success", "message": "تم تسجيل الدخول بنجاح"}
