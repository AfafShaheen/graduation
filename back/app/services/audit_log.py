"""Shared helper for writing audit log entries.

Constraints:
- No database connections are created here; the caller passes a live session.
- No authentication or action-code validation lives here.
- The caller owns the transaction and commits.
"""

import enum

from sqlalchemy import Column, Integer, MetaData, Table, Text, insert
from sqlalchemy.orm import Session


class ActorType(str, enum.Enum):
    ADMIN = "ADMIN"
    SCANNER = "SCANNER"


_metadata = MetaData()

audit_logs = Table(
    "audit_logs",
    _metadata,
    Column("id", Integer, primary_key=True),
    Column("actor_type", Text, nullable=False),
    Column("actor_id", Integer, nullable=False),
    Column("action", Text, nullable=False),
    Column("target", Text, nullable=False),
    Column("details", Text),
)


def write_audit_log(
    db: Session,
    actor_type: ActorType,
    actor_id: int,
    action: str,
    target: str,
    details: str | None = None,
) -> int:
    """Insert one row into ``audit_logs`` and return its id.

    ``created_at`` is filled by the database default. The action string is
    assumed to come from the shared project-wide action vocabulary
    (e.g. payment_confirmed, payment_rejected, qr_scanned, manual_entry,
    scan_reverted, email_changed, registration_extended). Failure here is
    never fatal to the caller's main operation.
    """
    log_id = db.execute(
        insert(audit_logs)
        .values(
            actor_type=actor_type.value,
            actor_id=actor_id,
            action=action,
            target=target,
            details=details,
        )
        .returning(audit_logs.c.id)
    ).scalar_one()
    db.flush()
    return log_id