from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.services.export_service import CONTENT_TYPE, export_service

router = APIRouter(prefix="/api/admin", tags=["Admin Export"])


@router.get("/export")
async def export_data(
    event_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    content, filename = await export_service(db, event_id, admin)
    return Response(
        content=content,
        media_type=CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
