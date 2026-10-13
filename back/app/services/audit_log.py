"""Shared helper for writing audit-log entries.

Responsibilities
----------------
- Provide a single ``record_audit`` helper used by the QR scanning flow (and
  available to any other caller) to append a row to ``audit_logs``.

Constraints
-----------
- No database connections are created here; the caller passes a live session.
- The caller owns the transaction — this module only ``flush``-es, never
  ``commit``-s, so an audit row and the business change it describes are
  committed atomically (FR-22 / NFR audit trail).
- ``action`` and ``target`` are clipped to the ``VARCHAR(255)`` column width so
  an over-long value can never abort the caller's transaction.
"""

import enum

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLogModel


class ActorType(str, enum.Enum):
    ADMIN = "ADMIN"
    SCANNER = "SCANNER"


_COLUMN_WIDTH = 255


def _clip(value: str) -> str:
    return value[:_COLUMN_WIDTH]


async def record_audit(
    db: AsyncSession,
    actor_type: ActorType,
    actor_id: int,
    action: str,
    target: str,
    details: str | None = None,
) -> None:
    """Append one row to ``audit_logs`` inside the caller's transaction.

    ``created_at`` is filled by the database default. The row is only
    ``flush``-ed, so the caller decides when to commit; if the caller rolls
    back, the audit row disappears with the rest of the transaction.
    """
    db.add(
        AuditLogModel(
            actor_type=actor_type.value,
            actor_id=actor_id,
            action=_clip(action),
            target=_clip(target),
            details=details,
        )
    )
    await db.flush()
