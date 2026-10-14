"""Read side of the audit log (audit viewer, item 3.5.2, D22).

Answers ``GET /api/admin/audit-logs``: filters, orders and paginates the audit
trail, resolves the acting admin/scanner and the related graduate with batch
queries (no N+1) and decorates every action with its Arabic label.

Scan attempts (``qr_scanned``) are excluded unless the caller explicitly asks
for them (``include_scans``), because they are by far the most frequent row
(D22). A deleted actor or graduate simply resolves to ``null`` — the audit row
itself is never dropped.
"""

import enum
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.models.admin import AdminModel
from app.models.audit_log import AuditLogModel
from app.models.graduate import GraduateModel
from app.models.scanner import ScannerModel

_SCAN_ACTION = "qr_scanned"
_EXCEPTIONAL_ACTIONS = (
    "MANUAL_CHECK_IN",
    "REVERT_SCAN",
    "REVERT_PAYMENT",
    "UPDATE_EMAIL",
)


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so a literal ``%`` or ``_`` matches literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _enum_value(value):
    """Return the raw value of an enum member, or the value itself."""
    return value.value if isinstance(value, enum.Enum) else value


async def list_audit_logs_service(
    db: AsyncSession,
    *,
    event_id: int | None = None,
    action: list[str] | None = None,
    actor_type=None,
    graduate_id: int | None = None,
    ticket_id: int | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    exceptional_only: bool = False,
    include_scans: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Return ``{"total": int, "items": [...]}`` for the audit viewer."""
    filters = []

    if not include_scans:
        filters.append(AuditLogModel.action != _SCAN_ACTION)
    if action:
        filters.append(AuditLogModel.action.in_(action))
    if exceptional_only:
        filters.append(AuditLogModel.action.in_(_EXCEPTIONAL_ACTIONS))
    if actor_type is not None:
        filters.append(AuditLogModel.actor_type == _enum_value(actor_type))
    if event_id is not None:
        filters.append(AuditLogModel.event_id == event_id)
    if graduate_id is not None:
        filters.append(AuditLogModel.graduate_id == graduate_id)
    if ticket_id is not None:
        filters.append(AuditLogModel.ticket_id == ticket_id)
    if date_from is not None:
        filters.append(AuditLogModel.created_at >= date_from)
    if date_to is not None:
        filters.append(AuditLogModel.created_at <= date_to)

    if q:
        pattern = f"%{_escape_like(q)}%"
        matching_graduates = select(GraduateModel.id).where(
            or_(
                GraduateModel.full_name.ilike(pattern, escape="\\"),
                GraduateModel.university_id.ilike(pattern, escape="\\"),
            )
        )
        filters.append(AuditLogModel.graduate_id.in_(matching_graduates))

    total = (
        await db.execute(
            select(func.count()).select_from(AuditLogModel).where(*filters)
        )
    ).scalar_one()

    stmt = (
        select(AuditLogModel)
        .where(*filters)
        .order_by(AuditLogModel.created_at.desc(), AuditLogModel.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "items": await _serialize(db, rows),
    }


async def _serialize(db: AsyncSession, rows) -> list[dict]:
    """Batch-resolve actors and graduates, then build the response items."""
    admin_ids = {r.actor_id for r in rows if _enum_value(r.actor_type) == "ADMIN"}
    scanner_ids = {r.actor_id for r in rows if _enum_value(r.actor_type) == "SCANNER"}

    usernames: dict[tuple[str, int], str] = {}
    if admin_ids:
        admins = (
            await db.execute(select(AdminModel).where(AdminModel.id.in_(admin_ids)))
        ).scalars()
        for admin in admins:
            usernames[("ADMIN", admin.id)] = admin.username
    if scanner_ids:
        scanners = (
            await db.execute(
                select(ScannerModel).where(ScannerModel.id.in_(scanner_ids))
            )
        ).scalars()
        for scanner in scanners:
            usernames[("SCANNER", scanner.id)] = scanner.username

    graduate_ids = {r.graduate_id for r in rows if r.graduate_id is not None}
    graduates: dict[int, GraduateModel] = {}
    if graduate_ids:
        found = (
            await db.execute(
                select(GraduateModel).where(GraduateModel.id.in_(graduate_ids))
            )
        ).scalars()
        for graduate in found:
            graduates[graduate.id] = graduate

    items = []
    for row in rows:
        actor_type = _enum_value(row.actor_type)
        graduate = graduates.get(row.graduate_id)
        items.append(
            {
                "id": row.id,
                "created_at": row.created_at,
                "actor": {
                    "type": actor_type,
                    "id": row.actor_id,
                    "username": usernames.get((actor_type, row.actor_id)),
                    "role_label": messages.audit_role_label(actor_type),
                },
                "action": row.action,
                "action_label": messages.audit_action_label(row.action),
                "target": row.target,
                "details": row.details,
                "event_id": row.event_id,
                "ticket_id": row.ticket_id,
                "graduate": (
                    {
                        "id": graduate.id,
                        "full_name": graduate.full_name,
                        "university_id": graduate.university_id,
                    }
                    if graduate is not None
                    else None
                ),
            }
        )
    return items
