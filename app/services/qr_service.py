"""Shared helpers for QR code value generation and companion activation.

Constraints:
- No database connections are created here; the caller passes a live session.
- No authentication or business rules (payment status, registration window...).
- The caller owns the transaction and commits.
"""

import enum
import secrets

from sqlalchemy import Boolean, Column, Integer, MetaData, Table, Text, update
from sqlalchemy.orm import Session


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