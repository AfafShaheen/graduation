from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.audit_log import AuditLogList
from app.services.audit_log import ActorType
from app.services.audit_viewer_service import list_audit_logs_service

router = APIRouter(prefix="/api/admin", tags=["Admin Audit Log"])


@router.get("/audit-logs", response_model=AuditLogList, status_code=status.HTTP_200_OK)
async def list_audit_logs(
    event_id: int | None = Query(None),
    action: list[str] | None = Query(None),
    actor_type: ActorType | None = Query(None),
    graduate_id: int | None = Query(None),
    ticket_id: int | None = Query(None),
    q: str | None = Query(None, max_length=100),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    exceptional_only: bool = Query(False),
    include_scans: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await list_audit_logs_service(
        db,
        event_id=event_id,
        action=action,
        actor_type=actor_type,
        graduate_id=graduate_id,
        ticket_id=ticket_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
        exceptional_only=exceptional_only,
        include_scans=include_scans,
        limit=limit,
        offset=offset,
    )
