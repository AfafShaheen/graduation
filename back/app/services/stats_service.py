from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.payment import PaymentModel
from app.models.ticket import TicketModel, TicketStatusEnum, TicketTypeEnum
from app.models.university_record import UniversityRecordModel


_MATCH = and_(
    GraduateModel.college_id == UniversityRecordModel.college_id,
    GraduateModel.university_id == UniversityRecordModel.university_id,
)


async def _scalar(db: AsyncSession, stmt) -> int:
    result = await db.execute(stmt)
    value = result.scalar_one()
    return int(value or 0)


def _expected_stmt(event_id):
    stmt = select(func.count()).select_from(UniversityRecordModel)
    if event_id is not None:
        stmt = stmt.where(UniversityRecordModel.event_id == event_id)
    return stmt


def _registered_stmt(event_id):
    stmt = (
        select(func.count())
        .select_from(UniversityRecordModel)
        .join(GraduateModel, _MATCH)
    )
    if event_id is not None:
        stmt = stmt.where(UniversityRecordModel.event_id == event_id)
    return stmt


def _tickets_by_status_stmt(event_id):
    stmt = select(TicketModel.status, func.count()).group_by(TicketModel.status)
    if event_id is not None:
        stmt = stmt.where(TicketModel.event_id == event_id)
    return stmt


def _payment_submitted_stmt(event_id):
    stmt = (
        select(func.count(func.distinct(PaymentModel.ticket_id)))
        .select_from(PaymentModel)
        .join(TicketModel, PaymentModel.ticket_id == TicketModel.id)
    )
    if event_id is not None:
        stmt = stmt.where(TicketModel.event_id == event_id)
    return stmt


def _ticket_types_stmt(event_id):
    stmt = (
        select(TicketModel.ticket_type, TicketModel.status, func.count())
        .group_by(TicketModel.ticket_type, TicketModel.status)
    )
    if event_id is not None:
        stmt = stmt.where(TicketModel.event_id == event_id)
    return stmt


def _expected_attendance_stmt(event_id):
    stmt = (
        select(
            TicketModel.status,
            func.count(),
            func.sum(TicketModel.companions_count),
        )
        .where(TicketModel.status.in_([TicketStatusEnum.CONFIRMED, TicketStatusEnum.PROCESSING]))
        .group_by(TicketModel.status)
    )
    if event_id is not None:
        stmt = stmt.where(TicketModel.event_id == event_id)
    return stmt


def _registered_without_ticket_stmt(event_id):
    ticket_exists = select(TicketModel.id).where(TicketModel.graduate_id == GraduateModel.id)
    if event_id is not None:
        ticket_exists = ticket_exists.where(TicketModel.event_id == event_id)
    stmt = (
        select(func.count())
        .select_from(GraduateModel)
        .join(UniversityRecordModel, _MATCH)
        .where(~ticket_exists.exists())
    )
    if event_id is not None:
        stmt = stmt.where(UniversityRecordModel.event_id == event_id)
    return stmt


def _colleges_stmt(event_id):
    stmt = select(CollegeModel.id, CollegeModel.name).order_by(CollegeModel.id)
    if event_id is not None:
        stmt = stmt.where(CollegeModel.event_id == event_id)
    return stmt


def _expected_by_college_stmt(event_id):
    stmt = select(UniversityRecordModel.college_id, func.count()).group_by(UniversityRecordModel.college_id)
    if event_id is not None:
        stmt = stmt.where(UniversityRecordModel.event_id == event_id)
    return stmt


def _registered_by_college_stmt(event_id):
    stmt = (
        select(UniversityRecordModel.college_id, func.count())
        .join(GraduateModel, _MATCH)
        .group_by(UniversityRecordModel.college_id)
    )
    if event_id is not None:
        stmt = stmt.where(UniversityRecordModel.event_id == event_id)
    return stmt


def _confirmed_by_college_stmt(event_id):
    stmt = (
        select(GraduateModel.college_id, func.count())
        .select_from(TicketModel)
        .join(GraduateModel, TicketModel.graduate_id == GraduateModel.id)
        .where(TicketModel.status == TicketStatusEnum.CONFIRMED)
        .group_by(GraduateModel.college_id)
    )
    if event_id is not None:
        stmt = stmt.where(TicketModel.event_id == event_id)
    return stmt


async def _build_block(db: AsyncSession, event_id, event_name) -> dict:
    expected = await _scalar(db, _expected_stmt(event_id))
    registered = await _scalar(db, _registered_stmt(event_id))
    not_registered = expected - registered

    status_rows = (await db.execute(_tickets_by_status_stmt(event_id))).all()
    status_counts = {row[0]: int(row[1]) for row in status_rows}
    confirmed = status_counts.get(TicketStatusEnum.CONFIRMED, 0)
    rejected = status_counts.get(TicketStatusEnum.REJECTED, 0)
    processing = status_counts.get(TicketStatusEnum.PROCESSING, 0)
    awaiting = status_counts.get(TicketStatusEnum.AWAITING_PAYMENT, 0)

    payment_submitted = await _scalar(db, _payment_submitted_stmt(event_id))
    registered_without_ticket = await _scalar(db, _registered_without_ticket_stmt(event_id))
    not_paid_yet = registered_without_ticket + awaiting

    ticket_types = {
        TicketTypeEnum.TWO_COMPANIONS.value: {"total": 0, "confirmed": 0},
        TicketTypeEnum.THREE_COMPANIONS.value: {"total": 0, "confirmed": 0},
    }
    for ttype, tstatus, count in (await db.execute(_ticket_types_stmt(event_id))).all():
        bucket = ticket_types.get(ttype.value)
        if bucket is None:
            continue
        bucket["total"] += int(count)
        if tstatus == TicketStatusEnum.CONFIRMED:
            bucket["confirmed"] += int(count)

    attendance = {"confirmed": 0, "processing": 0}
    for tstatus, count, companions_sum in (await db.execute(_expected_attendance_stmt(event_id))).all():
        key = "confirmed" if tstatus == TicketStatusEnum.CONFIRMED else "processing"
        attendance[key] = int(count) + int(companions_sum or 0)

    expected_by_college = {
        row[0]: int(row[1])
        for row in (await db.execute(_expected_by_college_stmt(event_id))).all()
    }
    registered_by_college = {
        row[0]: int(row[1])
        for row in (await db.execute(_registered_by_college_stmt(event_id))).all()
    }
    confirmed_by_college = {
        row[0]: int(row[1])
        for row in (await db.execute(_confirmed_by_college_stmt(event_id))).all()
    }

    by_college = []
    for college_id, college_name in (await db.execute(_colleges_stmt(event_id))).all():
        by_college.append({
            "college_id": college_id,
            "college_name": college_name,
            "expected": expected_by_college.get(college_id, 0),
            "registered": registered_by_college.get(college_id, 0),
            "tickets_confirmed": confirmed_by_college.get(college_id, 0),
        })

    return {
        "scope": {"event_id": event_id, "event_name": event_name},
        "graduates": {
            "expected": expected,
            "registered": registered,
            "not_registered": not_registered,
        },
        "tickets": {
            "payment_submitted": payment_submitted,
            "confirmed": confirmed,
            "rejected": rejected,
            "processing": processing,
            "awaiting_payment": awaiting,
            "not_paid_yet": not_paid_yet,
        },
        "ticket_types": ticket_types,
        "expected_attendance": attendance,
        "by_college": by_college,
    }


async def get_stats_service(db: AsyncSession, event_id=None) -> dict:
    if event_id is not None:
        event = await db.get(EventModel, event_id)
        if event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=messages.EVENT_NOT_FOUND)
        return await _build_block(db, event.id, event.name)

    events = (await db.execute(select(EventModel).order_by(EventModel.id))).scalars().all()
    block = await _build_block(db, None, None)
    block["per_event"] = [await _build_block(db, event.id, event.name) for event in events]
    return block
