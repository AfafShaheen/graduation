from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.services.stats_service import get_stats_service
from app.services.stats_v2_service import get_stats_v2_service

router = APIRouter(prefix="/api/admin", tags=["Admin Statistics"])


@router.get("/stats", status_code=status.HTTP_200_OK)
async def get_stats(
    event_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await get_stats_service(db, event_id)


@router.get("/stats/v2", status_code=status.HTTP_200_OK)
async def get_stats_v2(
    event_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Dashboard statistics (v2): one definition per number, cached for a few seconds."""
    return await get_stats_v2_service(db, event_id)
