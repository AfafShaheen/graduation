from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.services.stats_service import get_stats_service

router = APIRouter(prefix="/api/admin", tags=["Admin Statistics"])


@router.get("/stats", status_code=status.HTTP_200_OK)
async def get_stats(
    event_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await get_stats_service(db, event_id)
