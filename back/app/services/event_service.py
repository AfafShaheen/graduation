import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.models.event import EventModel
from app.models.college import CollegeModel
from app.models.event_college import EventCollegeModel
from app.models.event_ticket_package import EventTicketPackageModel
from app.models.graduate import GraduateModel
from app.models.ticket import TicketModel
from app.models.university_record import UniversityRecordModel
from app.schemas.event_admin import EventCreate, EventUpdate
from app.core.redis import redis_client
from app.core import messages
from app.services.graduate_service import normalize_arabic
from app.services.audit_log import ActorType, record_audit
from app.services.college_links import assert_windows_do_not_overlap


def _normalize_college_key(name: str) -> str:
    return normalize_arabic(name).casefold()


def _dedupe_college_names(names: List[str]) -> list[str]:
    """Drop blank names and collapse duplicates (after normalization)."""
    ordered: list[str] = []
    seen: set[str] = set()
    for name in names:
        cleaned = name.strip()
        if not cleaned:
            continue
        key = _normalize_college_key(cleaned)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return ordered


async def _colleges_by_normalized_name(db: AsyncSession) -> dict[str, CollegeModel]:
    res = await db.execute(select(CollegeModel))
    return {_normalize_college_key(c.name): c for c in res.scalars().all()}


async def _resolve_colleges_for_event(
    db: AsyncSession, college_names: List[str]
) -> list[CollegeModel]:
    """Find or create catalog colleges for the given names."""
    existing = await _colleges_by_normalized_name(db)
    colleges: list[CollegeModel] = []
    for cleaned_name in college_names:
        key = _normalize_college_key(cleaned_name)
        college = existing.get(key)
        if college is None:
            college = CollegeModel(name=cleaned_name)
            db.add(college)
            await db.flush()
            existing[key] = college
        colleges.append(college)
    return colleges


async def invalidate_events_cache() -> None:
    try:
        await redis_client.delete("public:registration:colleges")
        keys = await redis_client.keys("events:*")
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass


async def create_event_service(db: AsyncSession, data: EventCreate, admin: dict) -> dict:
    college_names = _dedupe_college_names(data.college_names)

    # 2. Link catalog colleges (creating missing ones by name). P5.3 allows a
    # college to be reused as long as the registration windows never overlap,
    # so the legacy "name linked to another event" rule was removed (P5.4).
    colleges = await _resolve_colleges_for_event(db, college_names)
    await assert_windows_do_not_overlap(
        db,
        [college.id for college in colleges],
        data.registration_start,
        data.registration_end,
    )

    # 1. Create Event record
    new_event = EventModel(
        name=data.name,
        event_date=data.event_date,
        event_time=data.event_time,
        seat_prefix=data.seat_prefix,
        registration_start=data.registration_start,
        registration_end=data.registration_end,
        whatsapp_group_link=data.whatsapp_group_link,
    )
    db.add(new_event)
    await db.flush()
    await db.refresh(new_event)

    # 2. Create the dynamic ticket packages for this event (P9).
    for package in data.packages:
        db.add(
            EventTicketPackageModel(
                event_id=new_event.id,
                companions_count=package.companions_count,
                price=package.price,
            )
        )
    await db.flush()

    # 2. Link catalog colleges (creating missing ones by name)
    for college in colleges:
        db.add(EventCollegeModel(event_id=new_event.id, college_id=college.id))
    await db.flush()

    # 3. Audit log
    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "CREATE_EVENT",
        f"Event ID {new_event.id}",
        f"Created event '{new_event.name}' with colleges: {', '.join(c.name for c in colleges)}",
        event_id=new_event.id,
    )

    await db.commit()
    await invalidate_events_cache()

    return {
        "status": "success",
        "message": "تم إنشاء الحفل وربط الكليات بنجاح.",
        "event_id": new_event.id
    }


async def list_events_service(
    db: AsyncSession,
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
    active_only: bool = False
) -> dict:
    cache_key = f"events:list:search={search}:skip={skip}:limit={limit}:active={active_only}"
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    stmt = select(EventModel).options(
        selectinload(EventModel.colleges),
        selectinload(EventModel.packages),
    )
    if search:
        stmt = stmt.where(EventModel.name.ilike(f"%{search}%"))

    now = datetime.now(UTC)
    if active_only:
        stmt = stmt.where(EventModel.registration_end >= now)

    count_stmt = select(EventModel)
    if search:
        count_stmt = count_stmt.where(EventModel.name.ilike(f"%{search}%"))
    if active_only:
        count_stmt = count_stmt.where(EventModel.registration_end >= now)

    total_res = await db.execute(count_stmt)
    total = len(total_res.scalars().all())

    stmt = stmt.offset(skip).limit(limit)
    res = await db.execute(stmt)
    events = res.scalars().all()

    items = []
    for ev in events:
        colleges = ev.colleges
        items.append({
            "id": ev.id,
            "name": ev.name,
            "event_date": ev.event_date.isoformat(),
            "event_time": ev.event_time.isoformat() if ev.event_time else None,
            "seat_prefix": ev.seat_prefix,
            "registration_start": ev.registration_start.isoformat(),
            "registration_end": ev.registration_end.isoformat(),
            "whatsapp_group_link": ev.whatsapp_group_link,
            "packages": [
                {"companions_count": p.companions_count, "price": str(p.price)}
                for p in ev.packages
            ],
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
            "colleges": [{"id": c.id, "name": c.name} for c in colleges]
        })

    result = {"total": total, "items": items}

    try:
        await redis_client.setex(cache_key, 300, json.dumps(result))
    except Exception:
        pass

    return result


async def get_event_details_service(db: AsyncSession, event_id: int) -> dict:
    cache_key = f"events:detail:{event_id}"
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    ev = await db.get(
        EventModel,
        event_id,
        options=(
            selectinload(EventModel.colleges),
            selectinload(EventModel.packages),
        ),
    )
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الحفل.")

    colleges = ev.colleges

    result = {
        "id": ev.id,
        "name": ev.name,
        "event_date": ev.event_date.isoformat(),
        "event_time": ev.event_time.isoformat() if ev.event_time else None,
        "seat_prefix": ev.seat_prefix,
        "registration_start": ev.registration_start.isoformat(),
        "registration_end": ev.registration_end.isoformat(),
        "whatsapp_group_link": ev.whatsapp_group_link,
        "packages": [
            {"companions_count": p.companions_count, "price": str(p.price)}
            for p in ev.packages
        ],
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
        "colleges": [{"id": c.id, "name": c.name} for c in colleges]
    }

    try:
        await redis_client.setex(cache_key, 300, json.dumps(result))
    except Exception:
        pass

    return result


async def update_event_service(db: AsyncSession, event_id: int, data: EventUpdate, admin: dict) -> dict:
    ev = await db.get(EventModel, event_id)
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الحفل.")

    update_data = data.model_dump(exclude_unset=True)

    packages = update_data.pop("packages", None)

    # FR-16: Package definitions are frozen once registration starts.
    if packages is not None:
        now = datetime.now(UTC)
        reg_start = ev.registration_start
        if reg_start.tzinfo is None:
            reg_start = reg_start.replace(tzinfo=UTC)

        if now >= reg_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="لا يمكن تعديل باقات التذاكر بعد بدء التسجيل."
            )

    # Seat prefix is locked once the event has any allocated seat (FR-24 extension).
    if "seat_prefix" in update_data and update_data["seat_prefix"] != ev.seat_prefix:
        existing_seat = await db.execute(
            select(TicketModel.id)
            .where(TicketModel.event_id == event_id, TicketModel.seat_start.is_not(None))
            .limit(1)
        )
        if existing_seat.scalars().first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=messages.SEAT_PREFIX_LOCKED,
            )

    # P5.3: a changed registration window may not overlap with another event
    # that shares one of this event's colleges.
    new_start = update_data.get("registration_start", ev.registration_start)
    new_end = update_data.get("registration_end", ev.registration_end)
    existing_college_ids = list(
        (
            await db.execute(
                select(EventCollegeModel.college_id).where(
                    EventCollegeModel.event_id == event_id
                )
            )
        )
        .scalars()
        .all()
    )
    await assert_windows_do_not_overlap(
        db,
        existing_college_ids,
        new_start,
        new_end,
        exclude_event_id=event_id,
    )

    for key, value in update_data.items():
        setattr(ev, key, value)

    if packages is not None:
        await db.execute(
            delete(EventTicketPackageModel).where(
                EventTicketPackageModel.event_id == event_id
            )
        )
        for package in packages:
            db.add(
                EventTicketPackageModel(
                    event_id=event_id,
                    companions_count=package["companions_count"],
                    price=package["price"],
                )
            )

    db.add(ev)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "UPDATE_EVENT",
        f"Event ID {event_id}",
        f"Updated event details for '{ev.name}'",
        event_id=event_id,
    )

    await db.commit()
    await invalidate_events_cache()

    return {"status": "success", "message": "تم تحديث الحفل بنجاح."}


async def delete_event_service(db: AsyncSession, event_id: int, admin: dict) -> dict:
    ev = await db.get(EventModel, event_id)
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الحفل.")

    # Check if there are ANY graduates or university_records tied to this event's colleges
    colleges_res = await db.execute(
        select(EventCollegeModel.college_id).where(EventCollegeModel.event_id == event_id)
    )
    college_ids = [c for c in colleges_res.scalars().all()]

    if college_ids:
        uni_rec_res = await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.college_id.in_(college_ids)))
        if uni_rec_res.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="لا يمكن حذف الحفل لأنه يحتوي على سجلات وخريجين مسجلين."
            )

        grad_res = await db.execute(select(GraduateModel).where(GraduateModel.college_id.in_(college_ids)))
        if grad_res.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="لا يمكن حذف الحفل لأنه يحتوي على سجلات وخريجين مسجلين."
            )

    await db.delete(ev)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "DELETE_EVENT",
        f"Event ID {event_id}",
        f"Deleted event '{ev.name}' and its linked colleges",
        event_id=event_id,
    )

    await db.commit()
    await invalidate_events_cache()

    return {"status": "success", "message": "تم حذف الحفل بنجاح."}
