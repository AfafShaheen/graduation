"""Volunteer-answers feature (SRS extension FR-26, item 3.5.3).

A graduate optionally records whether they want a volunteer responsibility and
whether they have prior experience. The answer is independent of the ticket
flow and of the registration window (D20) and is upserted per graduate.

The admin side lists/filters answers and exports them; volunteer data is
personal, so the admin endpoints are admin-only and the export is audited
(D24).
"""

from datetime import UTC, datetime
from io import BytesIO

from fastapi import HTTPException, status
from openpyxl import Workbook
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.volunteer_answer import VolunteerAnswerModel
from app.services.audit_log import ActorType, record_audit

CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

_EXPORT_HEADERS = (
    "الاسم الكامل",
    "الرقم الجامعي",
    "الكلية",
    "الهاتف",
    "يرغب بتولي مسؤولية",
    "لديه خبرة",
    "تاريخ التسجيل",
)


def _yn(value: bool) -> str:
    return "yes" if value else "no"


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so a literal ``%`` or ``_`` matches literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _string_cell(ws, row: int, col: int, value) -> None:
    """Write a value as an explicit string so it can never be a formula."""
    cell = ws.cell(row=row, column=col)
    cell.value = "" if value is None else str(value)
    cell.data_type = "s"


async def get_volunteer_answer_service(db: AsyncSession, graduate) -> dict:
    """Return the graduate's answer, or ``answered=false`` when none exists."""
    row = (
        await db.execute(
            select(VolunteerAnswerModel).where(
                VolunteerAnswerModel.graduate_id == graduate.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return {
            "answered": False,
            "wants_responsibility": None,
            "has_experience": None,
        }
    return {
        "answered": True,
        "wants_responsibility": _yn(row.wants_responsibility),
        "has_experience": _yn(row.has_experience),
    }


async def upsert_volunteer_answer_service(
    db: AsyncSession, graduate, data
) -> dict:
    """Create or update the graduate's answer (D20). ``updated_at`` changes."""
    wants = data.wants_responsibility == "yes"
    has_experience = data.has_experience == "yes"

    row = (
        await db.execute(
            select(VolunteerAnswerModel)
            .where(VolunteerAnswerModel.graduate_id == graduate.id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if row is None:
        row = VolunteerAnswerModel(
            graduate_id=graduate.id,
            wants_responsibility=wants,
            has_experience=has_experience,
        )
        db.add(row)
    else:
        row.wants_responsibility = wants
        row.has_experience = has_experience
        row.updated_at = datetime.now(UTC)

    await db.commit()

    return {
        "answered": True,
        "wants_responsibility": _yn(wants),
        "has_experience": _yn(has_experience),
    }


async def _ensure_event_exists(db: AsyncSession, event_id: int | None) -> None:
    if event_id is None:
        return
    if await db.get(EventModel, event_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=messages.EVENT_NOT_FOUND
        )


def _scope_filters(
    *, event_id, college_id, q, wants_responsibility, has_experience
) -> list:
    """Filters applied to the list (NOT to ``stats`` except ``event_id``)."""
    filters = []
    if event_id is not None:
        filters.append(CollegeModel.event_id == event_id)
    if college_id is not None:
        filters.append(GraduateModel.college_id == college_id)
    if wants_responsibility is not None:
        filters.append(
            VolunteerAnswerModel.wants_responsibility.is_(
                wants_responsibility == "yes"
            )
        )
    if has_experience is not None:
        filters.append(
            VolunteerAnswerModel.has_experience.is_(has_experience == "yes")
        )
    if q:
        pattern = f"%{_escape_like(q)}%"
        filters.append(
            or_(
                GraduateModel.full_name.ilike(pattern, escape="\\"),
                GraduateModel.university_id.ilike(pattern, escape="\\"),
                GraduateModel.phone.ilike(pattern, escape="\\"),
            )
        )
    return filters


async def _stats_scope(db: AsyncSession, event_id: int | None) -> dict:
    """Counts that depend ONLY on ``event_id`` (ignore the other filters)."""
    base = (
        select(func.count())
        .select_from(VolunteerAnswerModel)
        .join(GraduateModel, GraduateModel.id == VolunteerAnswerModel.graduate_id)
        .join(CollegeModel, CollegeModel.id == GraduateModel.college_id)
    )
    if event_id is not None:
        base = base.where(CollegeModel.event_id == event_id)

    all_count = (await db.execute(base)).scalar_one()
    wants = (
        await db.execute(
            base.where(VolunteerAnswerModel.wants_responsibility.is_(True))
        )
    ).scalar_one()
    experienced = (
        await db.execute(
            base.where(VolunteerAnswerModel.has_experience.is_(True))
        )
    ).scalar_one()
    both = (
        await db.execute(
            base.where(
                VolunteerAnswerModel.wants_responsibility.is_(True),
                VolunteerAnswerModel.has_experience.is_(True),
            )
        )
    ).scalar_one()
    return {
        "all": all_count,
        "wants": wants,
        "experienced": experienced,
        "both": both,
    }


def _order_by(sort: str):
    if sort == "name":
        return (GraduateModel.full_name.asc(), GraduateModel.id.asc())
    if sort == "college":
        return (
            CollegeModel.name.asc(),
            GraduateModel.full_name.asc(),
            VolunteerAnswerModel.id.asc(),
        )
    # newest (default)
    return (VolunteerAnswerModel.created_at.desc(), VolunteerAnswerModel.id.desc())


async def list_volunteers_service(
    db: AsyncSession,
    *,
    event_id: int | None = None,
    college_id: int | None = None,
    q: str | None = None,
    wants_responsibility: str | None = None,
    has_experience: str | None = None,
    sort: str = "newest",
    limit: int = 10,
    offset: int = 0,
) -> dict:
    """Return ``{"stats", "total", "items"}`` for the admin volunteers page."""
    await _ensure_event_exists(db, event_id)

    stats = await _stats_scope(db, event_id)
    filters = _scope_filters(
        event_id=event_id,
        college_id=college_id,
        q=q,
        wants_responsibility=wants_responsibility,
        has_experience=has_experience,
    )

    total = (
        await db.execute(
            select(func.count())
            .select_from(VolunteerAnswerModel)
            .join(
                GraduateModel,
                GraduateModel.id == VolunteerAnswerModel.graduate_id,
            )
            .join(CollegeModel, CollegeModel.id == GraduateModel.college_id)
            .where(*filters)
        )
    ).scalar_one()

    rows = (
        await db.execute(
            select(VolunteerAnswerModel, GraduateModel, CollegeModel)
            .join(
                GraduateModel,
                GraduateModel.id == VolunteerAnswerModel.graduate_id,
            )
            .join(CollegeModel, CollegeModel.id == GraduateModel.college_id)
            .where(*filters)
            .order_by(*_order_by(sort))
            .limit(limit)
            .offset(offset)
        )
    ).all()

    items = [
        {
            "id": answer.id,
            "graduate_id": graduate.id,
            "full_name": graduate.full_name,
            "university_id": graduate.university_id,
            "college_id": college.id,
            "college_name": college.name,
            "phone": graduate.phone,
            "wants_responsibility": _yn(answer.wants_responsibility),
            "has_experience": _yn(answer.has_experience),
            "registered_at": answer.created_at,
        }
        for answer, graduate, college in rows
    ]

    return {"stats": stats, "total": total, "items": items}


async def export_volunteers_service(
    db: AsyncSession,
    *,
    event_id: int | None = None,
    college_id: int | None = None,
    q: str | None = None,
    wants_responsibility: str | None = None,
    has_experience: str | None = None,
    sort: str = "newest",
    admin: dict,
):
    """Build the volunteer ``.xlsx`` and return ``(content_bytes, filename)``."""
    await _ensure_event_exists(db, event_id)

    filters = _scope_filters(
        event_id=event_id,
        college_id=college_id,
        q=q,
        wants_responsibility=wants_responsibility,
        has_experience=has_experience,
    )

    rows = (
        await db.execute(
            select(VolunteerAnswerModel, GraduateModel, CollegeModel)
            .join(
                GraduateModel,
                GraduateModel.id == VolunteerAnswerModel.graduate_id,
            )
            .join(CollegeModel, CollegeModel.id == GraduateModel.college_id)
            .where(*filters)
            .order_by(*_order_by(sort))
        )
    ).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "المتطوعون"
    ws.sheet_view.rightToLeft = True

    for col, header in enumerate(_EXPORT_HEADERS, start=1):
        _string_cell(ws, 1, col, header)

    for row_idx, (answer, graduate, college) in enumerate(rows, start=2):
        _string_cell(ws, row_idx, 1, graduate.full_name)
        _string_cell(ws, row_idx, 2, graduate.university_id)
        _string_cell(ws, row_idx, 3, college.name)
        _string_cell(ws, row_idx, 4, graduate.phone)
        _string_cell(
            ws, row_idx, 5,
            messages.VOLUNTEER_YES if answer.wants_responsibility
            else messages.VOLUNTEER_NO,
        )
        _string_cell(
            ws, row_idx, 6,
            messages.VOLUNTEER_YES if answer.has_experience
            else messages.VOLUNTEER_NO,
        )
        _string_cell(
            ws, row_idx, 7,
            answer.created_at.isoformat() if answer.created_at else "",
        )

    ws.freeze_panes = "A2"
    buffer = BytesIO()
    wb.save(buffer)
    content = buffer.getvalue()

    target = f"Event ID {event_id}" if event_id is not None else "All Events"
    summary = [
        f"event_id={event_id if event_id is not None else 'all'}",
        f"college_id={college_id if college_id is not None else 'all'}",
        f"q={'yes' if q else 'no'}",
        f"wants_responsibility={wants_responsibility or 'all'}",
        f"has_experience={has_experience or 'all'}",
        f"sort={sort}",
    ]
    await record_audit(
        db,
        actor_type=ActorType.ADMIN,
        actor_id=admin["admin_id"],
        action="DATA_EXPORTED",
        target=target,
        details=(
            f"scope=volunteers; {', '.join(summary)}; rows={len(rows)}"
        ),
        event_id=event_id,
    )
    await db.commit()

    day = datetime.now(UTC).strftime("%Y%m%d")
    scope_slug = str(event_id) if event_id is not None else "all"
    filename = f"volunteers_{scope_slug}_{day}.xlsx"
    return content, filename
