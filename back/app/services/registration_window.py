# Registration window checks (FR-3, D9)

from datetime import datetime, UTC
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.event import EventModel
from app.models.college import CollegeModel
from app.models.graduate import GraduateModel
from app.services.college_links import resolve_college_event
from app.core import messages


async def get_college_event(db: AsyncSession, college_id: int) -> EventModel | None:
    return await resolve_college_event(db, college_id)


async def get_graduate_event(db: AsyncSession, graduate: GraduateModel) -> EventModel | None:
    if graduate.college_id is None:
        return None
    return await resolve_college_event(db, graduate.college_id)


async def ensure_registration_open(event: EventModel | None, now: datetime | None = None) -> None:
    if event is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=messages.REGISTRATION_NOT_OPEN)
    now_utc = now or datetime.now(UTC)
    if event.registration_start is not None and now_utc < event.registration_start:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=messages.REGISTRATION_NOT_OPEN)
    if event.registration_end is not None and now_utc > event.registration_end:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=messages.REGISTRATION_CLOSED)
