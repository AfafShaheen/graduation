# College catalog links (P5): a college may be reused by several events.
#
# A college resolves to exactly one event at a time (P5.3): links are
# validated so that registration windows never overlap, which keeps
# event selection deterministic for verification and ticket flows.

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.event_college import EventCollegeModel


def _window_open(event: EventModel, now: datetime) -> bool:
    if event.registration_start is not None and now < event.registration_start:
        return False
    if event.registration_end is not None and now > event.registration_end:
        return False
    return True


async def linked_events(db: AsyncSession, college_id: int) -> list[EventModel]:
    """All events linked to a college, oldest registration window first."""
    stmt = (
        select(EventModel)
        .join(EventCollegeModel, EventCollegeModel.event_id == EventModel.id)
        .where(EventCollegeModel.college_id == college_id)
        .order_by(EventModel.registration_end.asc(), EventModel.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def colleges_for_event(db: AsyncSession, event_id: int) -> list[CollegeModel]:
    """Catalog colleges linked to an event, ordered by name."""
    stmt = (
        select(CollegeModel)
        .join(EventCollegeModel, EventCollegeModel.college_id == CollegeModel.id)
        .where(EventCollegeModel.event_id == event_id)
        .order_by(CollegeModel.name)
    )
    return list((await db.execute(stmt)).scalars().all())


async def college_ids_for_event(db: AsyncSession, event_id: int) -> list[int]:
    stmt = select(EventCollegeModel.college_id).where(
        EventCollegeModel.event_id == event_id
    )
    return list((await db.execute(stmt)).scalars().all())


def colleges_of_event_filter(event_id: int):
    """SQL filter fragment: colleges that belong to ``event_id``."""
    return CollegeModel.id.in_(select(EventCollegeModel.college_id).where(EventCollegeModel.event_id == event_id))


async def resolve_college_event(
    db: AsyncSession, college_id: int, now: datetime | None = None
) -> EventModel | None:
    """Event a college belongs to for registration/ticket purposes.

    Preference: an event whose window is currently open (the soonest
    closing one if several), otherwise the event with the latest window
    so callers report "registration closed" against the most recent
    ceremony.
    """
    events = await linked_events(db, college_id)
    if not events:
        return None
    now_utc = now or datetime.now(UTC)
    open_events = [e for e in events if _window_open(e, now_utc)]
    if open_events:
        return min(
            open_events,
            key=lambda e: (e.registration_end or datetime.max.replace(tzinfo=UTC), e.id),
        )
    return max(events, key=lambda e: (e.registration_end or datetime.min.replace(tzinfo=UTC), e.id))


async def assert_windows_do_not_overlap(
    db: AsyncSession,
    college_ids: list[int],
    registration_start: datetime | None,
    registration_end: datetime | None,
    exclude_event_id: int | None = None,
    *,
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> None:
    """P5.3: no college may be linked to two events with overlapping windows."""
    if registration_start is None or registration_end is None or not college_ids:
        return
    stmt = (
        select(EventModel)
        .join(EventCollegeModel, EventCollegeModel.event_id == EventModel.id)
        .where(EventCollegeModel.college_id.in_(college_ids))
    )
    others = list((await db.execute(stmt)).scalars().all())
    for other in others:
        if exclude_event_id is not None and other.id == exclude_event_id:
            continue
        other_start = other.registration_start or datetime.min.replace(tzinfo=UTC)
        other_end = other.registration_end or datetime.max.replace(tzinfo=UTC)
        if registration_start <= other_end and other_start <= registration_end:
            raise HTTPException(
                status_code=status_code,
                detail=f"{messages.COLLEGE_WINDOW_OVERLAP} (الحفل: {other.name})",
            )


async def ensure_colleges_exist(
    db: AsyncSession, college_ids: list[int]
) -> list[CollegeModel]:
    colleges: list[CollegeModel] = []
    for cid in college_ids:
        college = await db.get(CollegeModel, cid)
        if college is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"الكلية المحددة غير موجودة في الكتالوج (المعرف: {cid}).",
            )
        colleges.append(college)
    return colleges


async def set_event_colleges(
    db: AsyncSession, event: EventModel, colleges: list[CollegeModel]
) -> None:
    """Replace the event's college links with the given catalog entries."""
    wanted = {c.id for c in colleges}
    for link in list(event.college_links):
        if link.college_id not in wanted:
            await db.delete(link)
    existing = {link.college_id for link in event.college_links}
    for college in colleges:
        if college.id not in existing:
            event.college_links.append(EventCollegeModel(college_id=college.id))
    await db.flush()
