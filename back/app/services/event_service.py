import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.event import EventModel
from app.models.college import CollegeModel
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from app.schemas.event_admin import EventCreate, EventUpdate
from app.core.redis import redis_client
from app.core import messages
from app.services.graduate_service import normalize_arabic
from app.services.audit_log import ActorType, record_audit


def _normalize_college_key(name: str) -> str:
    return normalize_arabic(name).casefold()


def _dedupe_college_names(names: List[str]) -> tuple[list[str], set[str]]:
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
    return ordered, seen


async def _ensure_college_names_available(
    db: AsyncSession,
    normalized_keys: set[str],
    exclude_event_id: int | None = None,
) -> None:
    """Reject college names already linked to a different event (FR-14, UC-6 alt-a)."""
    if not normalized_keys:
        return
    res = await db.execute(select(CollegeModel.name, CollegeModel.event_id))
    for existing_name, existing_event_id in res.all():
        if exclude_event_id is not None and existing_event_id == exclude_event_id:
            continue
        if _normalize_college_key(existing_name) in normalized_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=messages.COLLEGE_LINKED_TO_OTHER_EVENT,
            )


async def invalidate_events_cache() -> None:
    try:
        await redis_client.delete("public:registration:colleges")
        keys = await redis_client.keys("events:*")
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass


async def create_event_service(db: AsyncSession, data: EventCreate, admin: dict) -> dict:
    college_names, normalized_keys = _dedupe_college_names(data.college_names)
    await _ensure_college_names_available(db, normalized_keys)

    # 1. Create Event record
    new_event = EventModel(
        name=data.name,
        event_date=data.event_date,
        registration_start=data.registration_start,
        registration_end=data.registration_end,
        whatsapp_group_link=data.whatsapp_group_link,
        is_3companions_enabled=data.is_3companions_enabled,
        price_2_companions=data.price_2_companions,
        price_3_companions=data.price_3_companions
    )
    db.add(new_event)
    await db.flush()
    await db.refresh(new_event)

    # 2. Create linked College records
    colleges = []
    for cleaned_name in college_names:
        college = CollegeModel(name=cleaned_name, event_id=new_event.id)
        db.add(college)
        colleges.append(cleaned_name)

    # 3. Audit log
    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "CREATE_EVENT",
        f"Event ID {new_event.id}",
        f"Created event '{new_event.name}' with colleges: {', '.join(colleges)}",
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

    stmt = select(EventModel)
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
        colleges_res = await db.execute(select(CollegeModel).where(CollegeModel.event_id == ev.id))
        colleges = colleges_res.scalars().all()
        items.append({
            "id": ev.id,
            "name": ev.name,
            "event_date": ev.event_date.isoformat(),
            "registration_start": ev.registration_start.isoformat(),
            "registration_end": ev.registration_end.isoformat(),
            "whatsapp_group_link": ev.whatsapp_group_link,
            "is_3companions_enabled": ev.is_3companions_enabled,
            "price_2_companions": str(ev.price_2_companions),
            "price_3_companions": str(ev.price_3_companions),
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

    ev = await db.get(EventModel, event_id)
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الحفل.")

    colleges_res = await db.execute(select(CollegeModel).where(CollegeModel.event_id == event_id))
    colleges = colleges_res.scalars().all()

    result = {
        "id": ev.id,
        "name": ev.name,
        "event_date": ev.event_date.isoformat(),
        "registration_start": ev.registration_start.isoformat(),
        "registration_end": ev.registration_end.isoformat(),
        "whatsapp_group_link": ev.whatsapp_group_link,
        "is_3companions_enabled": ev.is_3companions_enabled,
        "price_2_companions": str(ev.price_2_companions),
        "price_3_companions": str(ev.price_3_companions),
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

    # FR-16: Check if is_3companions_enabled is being modified
    if "is_3companions_enabled" in update_data and update_data["is_3companions_enabled"] != ev.is_3companions_enabled:
        now = datetime.now(UTC)
        reg_start = ev.registration_start
        if reg_start.tzinfo is None:
            reg_start = reg_start.replace(tzinfo=UTC)

        # Once registration starts, modifying this flag is strictly forbidden
        if now >= reg_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="لا يمكن تفعيل/تعطيل نوع التذكرة بعد بدء التسجيل."
            )

    for key, value in update_data.items():
        setattr(ev, key, value)

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
    colleges_res = await db.execute(select(CollegeModel.id).where(CollegeModel.event_id == event_id))
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
