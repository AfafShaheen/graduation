import json
from datetime import UTC, datetime
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import redis_client
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.event_college import EventCollegeModel
from app.schemas.major import RegistrationCollegeItem
from app.services.settings_service import (
    CONTACT_PHONE,
    SHAMCASH_ACCOUNT_NUMBER,
    SHAMCASH_QR_IMAGE,
    SHAMCASH_RECEIVER_NAME,
    get_setting,
)

router = APIRouter(prefix="/api", tags=["Public"])


@router.get("/colleges", status_code=status.HTTP_200_OK)
async def list_public_colleges(db: AsyncSession = Depends(get_db)):
    """Public college list for the registration form (FR-1, FR-3)."""
    result = await db.execute(select(CollegeModel).order_by(CollegeModel.name))
    colleges = result.scalars().all()
    return [{"id": c.id, "name": c.name} for c in colleges]


@router.get("/registration/colleges", response_model=list[RegistrationCollegeItem], status_code=status.HTTP_200_OK)
async def list_registration_colleges(db: AsyncSession = Depends(get_db)):
    """Public registration colleges and majors list (Section 5.1).

    Only returns colleges whose event registration has not ended.
    Cached in Redis for 60 seconds with fail-open.
    """
    cache_key = "public:registration:colleges"
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    now = datetime.now(UTC)

    def _window_open(ev: EventModel) -> bool:
        return (
            (ev.registration_start is None or ev.registration_start <= now)
            and (ev.registration_end is None or ev.registration_end >= now)
        )

    def _pick_event(events: list[EventModel]) -> EventModel:
        open_ones = [ev for ev in events if _window_open(ev)]
        if open_ones:
            return sorted(
                open_ones,
                key=lambda ev: (ev.registration_end or datetime.max.replace(tzinfo=UTC), ev.id),
            )[0]
        return sorted(
            events,
            key=lambda ev: (ev.registration_end or datetime.min.replace(tzinfo=UTC), ev.id),
        )[-1]

    stmt = (
        select(CollegeModel)
        .join(EventCollegeModel, EventCollegeModel.college_id == CollegeModel.id)
        .join(EventModel, EventModel.id == EventCollegeModel.event_id)
        .options(selectinload(CollegeModel.majors), selectinload(CollegeModel.events))
        .where(
            (EventModel.registration_end.is_(None)) | (EventModel.registration_end >= now)
        )
        .order_by(CollegeModel.name)
        .distinct()
    )
    result = await db.execute(stmt)
    colleges = result.scalars().all()

    output = []
    for c in colleges:
        eligible = [
            ev for ev in c.events
            if ev.registration_end is None or ev.registration_end >= now
        ]
        if not eligible:
            continue
        event = _pick_event(eligible)
        sorted_majors = sorted(c.majors, key=lambda m: m.name)
        output.append({
            "id": c.id,
            "name": c.name,
            "event_id": event.id,
            "majors": [{"id": m.id, "name": m.name} for m in sorted_majors]
        })

    try:
        await redis_client.setex(cache_key, 60, json.dumps(output))
    except Exception:
        pass

    return output


@router.get("/settings/public", status_code=status.HTTP_200_OK)
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Public contact number only; never exposes other settings (FR-2)."""
    contact_phone = await get_setting(db, CONTACT_PHONE)
    return {"contact_phone": contact_phone}


@router.get("/settings/shamcash-qr", status_code=status.HTTP_200_OK)
async def get_public_shamcash(db: AsyncSession = Depends(get_db)):
    """Public ShamCash payment info shown to the graduate (FR-21)."""
    return {
        "shamcash_qr_image": await get_setting(db, SHAMCASH_QR_IMAGE),
        "shamcash_receiver_name": await get_setting(db, SHAMCASH_RECEIVER_NAME),
        "shamcash_account_number": await get_setting(db, SHAMCASH_ACCOUNT_NUMBER),
    }
