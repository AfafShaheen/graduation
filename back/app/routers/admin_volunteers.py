from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.volunteer_answer import VolunteerListResponse
from app.services.volunteer_service import (
    CONTENT_TYPE,
    export_volunteers_service,
    list_volunteers_service,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Volunteers"])

_Sort = Literal["newest", "name", "college"]


@router.get(
    "/volunteers",
    response_model=VolunteerListResponse,
    status_code=status.HTTP_200_OK,
)
async def list_volunteers(
    event_id: int | None = Query(None),
    college_id: int | None = Query(None),
    q: str | None = Query(None, max_length=100),
    wants_responsibility: Literal["yes", "no"] | None = Query(None),
    has_experience: Literal["yes", "no"] | None = Query(None),
    sort: _Sort = Query("newest"),
    limit: int = Query(10, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return await list_volunteers_service(
        db,
        event_id=event_id,
        college_id=college_id,
        q=q,
        wants_responsibility=wants_responsibility,
        has_experience=has_experience,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/volunteers/export", status_code=status.HTTP_200_OK)
async def export_volunteers(
    event_id: int | None = Query(None),
    college_id: int | None = Query(None),
    q: str | None = Query(None, max_length=100),
    wants_responsibility: Literal["yes", "no"] | None = Query(None),
    has_experience: Literal["yes", "no"] | None = Query(None),
    sort: _Sort = Query("newest"),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    content, filename = await export_volunteers_service(
        db,
        event_id=event_id,
        college_id=college_id,
        q=q,
        wants_responsibility=wants_responsibility,
        has_experience=has_experience,
        sort=sort,
        admin=admin,
    )
    return Response(
        content,
        media_type=CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
