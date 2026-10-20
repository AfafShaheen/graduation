"""Global college catalog CRUD (P5.2).

Colleges belong to the catalog rather than a single event; the ownership links
live in ``event_colleges``. Deletion is refused while a graduate, a university
record or an event link still references the college.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import messages
from app.models.college import CollegeModel
from app.models.event_college import EventCollegeModel
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from app.schemas.college import CollegeCreate, CollegeUpdate
from app.services.event_service import invalidate_events_cache
from app.services.graduate_service import normalize_arabic

_LOADED = (selectinload(CollegeModel.majors), selectinload(CollegeModel.events))


def _normalize_name(name: str) -> str:
    return normalize_arabic(name).casefold()


def _build(college: CollegeModel) -> dict:
    return {
        "id": college.id,
        "name": college.name,
        "majors": [
            {"id": major.id, "name": major.name}
            for major in sorted(college.majors, key=lambda item: item.name)
        ],
        "events": [
            {"id": event.id, "name": event.name}
            for event in sorted(college.events, key=lambda item: item.name)
        ],
    }


async def _payload(db: AsyncSession, college_id: int) -> dict:
    stmt = (
        select(CollegeModel)
        .where(CollegeModel.id == college_id)
        .options(*_LOADED)
    )
    college = (await db.execute(stmt)).scalar_one_or_none()
    if college is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.COLLEGE_NOT_FOUND
        )
    return _build(college)


async def _assert_name_free(
    db: AsyncSession, normalized_name: str, exclude_id: int | None = None
) -> None:
    res = await db.execute(select(CollegeModel.id, CollegeModel.name))
    for college_id, existing_name in res.all():
        if exclude_id is not None and college_id == exclude_id:
            continue
        if _normalize_name(existing_name) == normalized_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=messages.COLLEGE_NAME_TAKEN,
            )


async def list_colleges_service(db: AsyncSession) -> list[dict]:
    stmt = select(CollegeModel).options(*_LOADED).order_by(CollegeModel.name)
    colleges = (await db.execute(stmt)).scalars().all()
    return [_build(college) for college in colleges]


async def create_college_service(db: AsyncSession, data: CollegeCreate) -> dict:
    await _assert_name_free(db, _normalize_name(data.name))
    college = CollegeModel(name=data.name.strip())
    db.add(college)
    await db.flush()
    await db.commit()
    payload = await _payload(db, college.id)
    await invalidate_events_cache()
    return payload


async def update_college_service(
    db: AsyncSession, college_id: int, data: CollegeUpdate
) -> dict:
    college = await db.get(CollegeModel, college_id)
    if college is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.COLLEGE_NOT_FOUND
        )
    await _assert_name_free(db, _normalize_name(data.name), exclude_id=college_id)
    college.name = data.name.strip()
    db.add(college)
    await db.commit()
    payload = await _payload(db, college_id)
    await invalidate_events_cache()
    return payload


async def delete_college_service(db: AsyncSession, college_id: int) -> dict:
    college = await db.get(CollegeModel, college_id)
    if college is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.COLLEGE_NOT_FOUND
        )

    graduate_count = await db.scalar(
        select(func.count())
        .select_from(GraduateModel)
        .where(GraduateModel.college_id == college_id)
    )
    if graduate_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.COLLEGE_HAS_GRADUATES,
        )

    record_count = await db.scalar(
        select(func.count())
        .select_from(UniversityRecordModel)
        .where(UniversityRecordModel.college_id == college_id)
    )
    if record_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.COLLEGE_HAS_RECORDS,
        )

    link_count = await db.scalar(
        select(func.count())
        .select_from(EventCollegeModel)
        .where(EventCollegeModel.college_id == college_id)
    )
    if link_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.COLLEGE_LINKED_TO_EVENT,
        )

    await db.delete(college)
    await db.commit()
    await invalidate_events_cache()
    return {"status": "success", "message": messages.COLLEGE_DELETED}
