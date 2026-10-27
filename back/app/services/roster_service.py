"""Admin roster: the full graduates list of the uploaded university files.

One row per imported university record, joined (LEFT JOIN) with the person's
account, the ticket of the record's ceremony, the latest payment and the entry
(scan) state of the graduate's own QR code. Everybody who is in an uploaded
file appears, registered or not.

The module is read-only. The exceptional actions (return a payment to
processing, manual entry, cancel a scan) stay in ``admin_graduate_service``;
the roster only reports through ``actions`` which of them are allowed right
now, so the front end never re-implements the rules.

The effective "top student" status of a record is computed exactly like the
registration does: the value from the file when the file had that column,
otherwise the dense rank of the GPA inside (event, college, major).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO
from typing import Any, Dict, List, Tuple

from fastapi import HTTPException, status
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core import messages
from app.core.sql_utils import escape_like
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.major import MajorModel
from app.models.payment import PaymentModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketModel, TicketStatusEnum
from app.models.university_file import UniversityFileModel
from app.models.university_record import UniversityRecordModel
from app.services.audit_log import ActorType, record_audit
from app.services.export_service import CONTENT_TYPE, _number_cell, _string_cell
from app.services.graduate_service import normalize_arabic
from app.services.seat_service import seat_labels

# Safety cap for the Excel export (the list itself is always paginated).
EXPORT_MAX_ROWS = 20000

_TICKET_STATUS = {
    "awaiting_payment": TicketStatusEnum.AWAITING_PAYMENT,
    "processing": TicketStatusEnum.PROCESSING,
    "confirmed": TicketStatusEnum.CONFIRMED,
    "rejected": TicketStatusEnum.REJECTED,
}
_TICKET_TYPE_COMPANIONS = {"two": 2, "three": 3}

REGISTRATION_LABELS = {
    "not_registered": "لم يسجّل بعد",
    "unverified": "سجّل — بانتظار تأكيد البريد (OTP)",
    "verified": "سجّل — تم تأكيد البريد (OTP)",
}
TICKET_LABELS = {
    TicketStatusEnum.AWAITING_PAYMENT: "بانتظار الدفع",
    TicketStatusEnum.PROCESSING: "قيد المعالجة",
    TicketStatusEnum.CONFIRMED: "مؤكدة",
    TicketStatusEnum.REJECTED: "مرفوضة",
}
PAYMENT_LABELS = {
    "none": "لم يُرسل دفع",
    "pending": "قيد المراجعة",
    "confirmed": "مؤكد",
    "rejected": "مرفوض",
}
_RANK_LABELS = {1: "الأول", 2: "الثاني", 3: "الثالث"}

_EXPORT_HEADERS = (
    "الحفل",
    "الملف المرفوع",
    "الاسم الكامل",
    "الرقم الجامعي",
    "اسم الأب",
    "اسم الأم",
    "الجنس",
    "الكلية",
    "التخصص",
    "الأوائل",
    "حالة التسجيل",
    "البريد الإلكتروني",
    "تأكيد البريد (OTP)",
    "حالة التذكرة",
    "عدد المرافقين",
    "المقعد",
    "حالة الدفع",
    "المبلغ المدفوع",
    "سعر التذكرة",
    "عدم تطابق المبلغ",
    "الدخول",
    "وقت الدخول",
    "طريقة الدخول",
)


@dataclass(frozen=True)
class RosterFilters:
    """All filters are optional; ``None`` means "do not filter"."""

    search: str | None = None
    file_id: int | None = None
    event_id: int | None = None
    college_id: int | None = None
    registration: str | None = None  # not_registered | unverified | verified
    top_rank: str | None = None  # none | any | 1 | 2 | 3
    ticket: str | None = None  # none | awaiting_payment | processing | confirmed | rejected
    payment: str | None = None  # none | pending | confirmed | rejected | mismatch
    entry: str | None = None  # entered | not_entered
    ticket_type: str | None = None  # two | three


class _Parts:
    """The aliased tables and sub-queries shared by the list and the count."""

    def __init__(self) -> None:
        r = UniversityRecordModel
        # Dense rank of the GPA inside (event, college, major). NULL GPAs sort
        # last and are never treated as ranked (see ``eff_top``).
        self.ranked = select(
            r.id.label("rid"),
            func.dense_rank()
            .over(
                partition_by=[r.event_id, r.college_id, r.major_id],
                order_by=r.gpa.desc().nulls_last(),
            )
            .label("dr"),
        ).subquery("ranked")
        self.latest = (
            select(
                PaymentModel.ticket_id, func.max(PaymentModel.id).label("payment_id")
            )
            .group_by(PaymentModel.ticket_id)
            .subquery("latest_payment")
        )
        self.pay = aliased(PaymentModel)
        self.qr = aliased(QrCodeModel)
        # 0 = not a top student, -1 = top student without a known rank,
        # 1..3 = rank. The file wins; the GPA ranking is only the fallback for
        # files that had no top-student column.
        self.eff_top = case(
            (r.top_rank_from_file.is_not(None), r.top_rank_from_file),
            (and_(r.gpa.is_not(None), self.ranked.c.dr <= 3), self.ranked.c.dr),
            else_=0,
        )

    def join(self, stmt):
        r = UniversityRecordModel
        return (
            stmt.select_from(r)
            .join(CollegeModel, CollegeModel.id == r.college_id)
            .join(EventModel, EventModel.id == r.event_id)
            .join(self.ranked, self.ranked.c.rid == r.id)
            .outerjoin(MajorModel, MajorModel.id == r.major_id)
            .outerjoin(UniversityFileModel, UniversityFileModel.id == r.file_id)
            .outerjoin(
                GraduateModel,
                and_(
                    GraduateModel.college_id == r.college_id,
                    GraduateModel.university_id == r.university_id,
                ),
            )
            .outerjoin(
                TicketModel,
                and_(
                    TicketModel.graduate_id == GraduateModel.id,
                    TicketModel.event_id == r.event_id,
                ),
            )
            .outerjoin(self.latest, self.latest.c.ticket_id == TicketModel.id)
            .outerjoin(self.pay, self.pay.id == self.latest.c.payment_id)
            .outerjoin(
                self.qr,
                and_(
                    self.qr.ticket_id == TicketModel.id,
                    self.qr.code_type == QrCodeTypeEnum.GRADUATE,
                ),
            )
        )


def _conditions(f: RosterFilters, parts: _Parts) -> List[Any]:
    r = UniversityRecordModel
    conds: List[Any] = []

    term = (f.search or "").strip()
    if term:
        # Names are stored normalised (see the importer), so normalise the term.
        like = f"%{escape_like(normalize_arabic(term))}%"
        conds.append(
            or_(
                r.full_name.ilike(like, escape="\\"),
                r.university_id.ilike(like, escape="\\"),
            )
        )
    if f.file_id is not None:
        conds.append(r.file_id == f.file_id)
    if f.event_id is not None:
        conds.append(r.event_id == f.event_id)
    if f.college_id is not None:
        conds.append(r.college_id == f.college_id)

    if f.registration == "not_registered":
        conds.append(GraduateModel.id.is_(None))
    elif f.registration == "unverified":
        conds.append(GraduateModel.id.is_not(None))
        conds.append(GraduateModel.email_verified.is_(False))
    elif f.registration == "verified":
        conds.append(GraduateModel.email_verified.is_(True))

    if f.top_rank == "none":
        conds.append(parts.eff_top == 0)
    elif f.top_rank == "any":
        conds.append(parts.eff_top != 0)
    elif f.top_rank in ("1", "2", "3"):
        conds.append(parts.eff_top == int(f.top_rank))

    if f.ticket == "none":
        conds.append(TicketModel.id.is_(None))
    elif f.ticket in _TICKET_STATUS:
        conds.append(TicketModel.status == _TICKET_STATUS[f.ticket])

    pay = parts.pay
    if f.payment == "none":
        conds.append(pay.id.is_(None))
    elif f.payment == "pending":
        conds.append(and_(pay.id.is_not(None), TicketModel.status == TicketStatusEnum.PROCESSING))
    elif f.payment == "confirmed":
        conds.append(and_(pay.id.is_not(None), TicketModel.status == TicketStatusEnum.CONFIRMED))
    elif f.payment == "rejected":
        conds.append(and_(pay.id.is_not(None), TicketModel.status == TicketStatusEnum.REJECTED))
    elif f.payment == "mismatch":
        conds.append(and_(pay.id.is_not(None), pay.amount != TicketModel.price))

    if f.entry == "entered":
        conds.append(parts.qr.scanned_at.is_not(None))
    elif f.entry == "not_entered":
        conds.append(parts.qr.scanned_at.is_(None))

    if f.ticket_type in _TICKET_TYPE_COMPANIONS:
        conds.append(TicketModel.companions_count == _TICKET_TYPE_COMPANIONS[f.ticket_type])

    return conds


def _select_columns(parts: _Parts):
    return select(
        UniversityRecordModel,
        CollegeModel.name.label("college_name"),
        MajorModel.name.label("major_name"),
        EventModel.name.label("event_name"),
        EventModel.seat_prefix.label("seat_prefix"),
        UniversityFileModel.original_name.label("file_name"),
        GraduateModel.id.label("graduate_id"),
        GraduateModel.email.label("email"),
        GraduateModel.email_verified.label("email_verified"),
        TicketModel.id.label("ticket_id"),
        TicketModel.status.label("ticket_status"),
        TicketModel.companions_count.label("companions_count"),
        TicketModel.price.label("ticket_price"),
        TicketModel.seat_start.label("seat_start"),
        parts.pay.id.label("payment_id"),
        parts.pay.amount.label("payment_amount"),
        parts.pay.submitted_at.label("payment_at"),
        parts.qr.scanned_at.label("scanned_at"),
        parts.qr.scanned_by_scanner_id.label("scanned_by"),
        parts.eff_top.label("eff_top"),
    )


def _ordered(stmt):
    return stmt.order_by(UniversityRecordModel.full_name, UniversityRecordModel.id)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _money(value) -> str | None:
    return str(value) if value is not None else None


def _payment_state(has_payment: bool, ticket_status) -> str:
    if not has_payment:
        return "none"
    if ticket_status == TicketStatusEnum.PROCESSING:
        return "pending"
    if ticket_status == TicketStatusEnum.CONFIRMED:
        return "confirmed"
    if ticket_status == TicketStatusEnum.REJECTED:
        return "rejected"
    return "none"


def _item(row) -> Dict[str, Any]:
    rec: UniversityRecordModel = row[0]
    eff = int(row.eff_top or 0)

    if row.graduate_id is None:
        reg_state = "not_registered"
    elif row.email_verified:
        reg_state = "verified"
    else:
        reg_state = "unverified"

    ticket = None
    if row.ticket_id is not None:
        seat = seat_labels(row.seat_prefix, row.seat_start, row.companions_count)
        ticket = {
            "id": row.ticket_id,
            "status": row.ticket_status.value,
            "companions_count": row.companions_count,
            "type": {2: "two", 3: "three"}.get(row.companions_count, str(row.companions_count)),
            "price": _money(row.ticket_price),
            "seat": seat["range"] if seat else None,
        }

    has_payment = row.payment_id is not None
    mismatch = bool(
        has_payment
        and row.ticket_price is not None
        and Decimal(row.payment_amount) != Decimal(row.ticket_price)
    )
    entered = row.scanned_at is not None
    confirmed = row.ticket_status == TicketStatusEnum.CONFIRMED

    return {
        "record_id": rec.id,
        "event_id": rec.event_id,
        "event_name": row.event_name,
        "university_id": rec.university_id,
        "full_name": rec.full_name,
        "father_name": rec.father_name,
        "mother_name": rec.mother_name,
        "gender": rec.gender,
        "college_id": rec.college_id,
        "college_name": row.college_name,
        "major_id": rec.major_id,
        "major_name": row.major_name,
        "gpa": _money(rec.gpa),
        "top_rank": eff if eff in (1, 2, 3) else None,
        "is_top": eff != 0,
        "file_id": rec.file_id,
        "file_name": row.file_name,
        "registration": {
            "state": reg_state,
            "graduate_id": row.graduate_id,
            "email": row.email,
            "email_verified": row.email_verified if row.graduate_id is not None else None,
        },
        "ticket": ticket,
        "payment": {
            "state": _payment_state(has_payment, row.ticket_status),
            "amount": _money(row.payment_amount) if has_payment else None,
            "submitted_at": _iso(row.payment_at) if has_payment else None,
            "mismatch": mismatch,
        },
        "entry": {
            "entered": entered,
            "at": _iso(row.scanned_at),
            "manual": entered and row.scanned_by is None,
        },
        "actions": {
            "revert_payment": confirmed,
            "manual_entry": confirmed and not entered,
            "cancel_scan": entered,
        },
    }


async def list_roster(
    db: AsyncSession, filters: RosterFilters, skip: int, limit: int
) -> Dict[str, Any]:
    parts = _Parts()
    conds = _conditions(filters, parts)

    count_stmt = parts.join(select(func.count(UniversityRecordModel.id)))
    if conds:
        count_stmt = count_stmt.where(*conds)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = parts.join(_select_columns(parts))
    if conds:
        stmt = stmt.where(*conds)
    stmt = _ordered(stmt).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).all()

    return {"total": int(total), "items": [_item(row) for row in rows]}


def _top_label(eff: int) -> str:
    if eff in _RANK_LABELS:
        return f"من الأوائل — {_RANK_LABELS[eff]}"
    if eff == -1:
        return "من الأوائل"
    return "لا يوجد"


def _filters_summary(f: RosterFilters) -> str:
    """Names of the active filters only: never their values (a search term can
    be a person's name, and the audit log must not hold personal data)."""
    active = [name for name, value in vars(f).items() if value not in (None, "")]
    return ",".join(active) if active else "none"


async def export_roster(
    db: AsyncSession, filters: RosterFilters, admin: dict
) -> Tuple[bytes, str]:
    parts = _Parts()
    conds = _conditions(filters, parts)

    count_stmt = parts.join(select(func.count(UniversityRecordModel.id)))
    if conds:
        count_stmt = count_stmt.where(*conds)
    total = int((await db.execute(count_stmt)).scalar_one())
    if total > EXPORT_MAX_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.ROSTER_EXPORT_TOO_LARGE,
        )

    stmt = parts.join(_select_columns(parts))
    if conds:
        stmt = stmt.where(*conds)
    rows = (await db.execute(_ordered(stmt))).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "قائمة الخريجين"
    ws.sheet_view.rightToLeft = True

    for col_idx, header in enumerate(_EXPORT_HEADERS, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.value = header
        cell.data_type = "s"
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="right", vertical="center")

    for row_idx, row in enumerate(rows, start=2):
        item = _item(row)
        ticket = item["ticket"]
        pay = item["payment"]
        entry = item["entry"]
        reg = item["registration"]
        eff = int(row.eff_top or 0)

        _string_cell(ws, row_idx, 1, item["event_name"])
        _string_cell(ws, row_idx, 2, item["file_name"])
        _string_cell(ws, row_idx, 3, item["full_name"])
        _string_cell(ws, row_idx, 4, item["university_id"])
        _string_cell(ws, row_idx, 5, item["father_name"])
        _string_cell(ws, row_idx, 6, item["mother_name"])
        _string_cell(ws, row_idx, 7, item["gender"])
        _string_cell(ws, row_idx, 8, item["college_name"])
        _string_cell(ws, row_idx, 9, item["major_name"])
        _string_cell(ws, row_idx, 10, _top_label(eff))
        _string_cell(ws, row_idx, 11, REGISTRATION_LABELS[reg["state"]])
        _string_cell(ws, row_idx, 12, reg["email"])
        _string_cell(
            ws,
            row_idx,
            13,
            "" if reg["email_verified"] is None else ("نعم" if reg["email_verified"] else "لا"),
        )
        _string_cell(
            ws,
            row_idx,
            14,
            TICKET_LABELS[row.ticket_status] if ticket else "لا توجد تذكرة",
        )
        _number_cell(ws, row_idx, 15, ticket["companions_count"] if ticket else None)
        _string_cell(ws, row_idx, 16, ticket["seat"] if ticket else "")
        _string_cell(ws, row_idx, 17, PAYMENT_LABELS[pay["state"]])
        _number_cell(ws, row_idx, 18, pay["amount"])
        _number_cell(ws, row_idx, 19, ticket["price"] if ticket else None)
        _string_cell(ws, row_idx, 20, "نعم" if pay["mismatch"] else "")
        _string_cell(ws, row_idx, 21, "دخل" if entry["entered"] else "لم يدخل")
        _string_cell(ws, row_idx, 22, entry["at"])
        _string_cell(
            ws,
            row_idx,
            23,
            ("يدوي" if entry["manual"] else "ماسح") if entry["entered"] else "",
        )

    ws.freeze_panes = "A2"

    buffer = BytesIO()
    wb.save(buffer)

    await record_audit(
        db,
        actor_type=ActorType.ADMIN,
        actor_id=admin["admin_id"],
        action="ROSTER_EXPORTED",
        target="Roster",
        details=f"rows={len(rows)}; filters={_filters_summary(filters)}",
        event_id=filters.event_id,
    )
    await db.commit()

    day = datetime.now(UTC).strftime("%Y%m%d")
    return buffer.getvalue(), f"graduates_roster_{day}.xlsx"


__all__ = ["CONTENT_TYPE", "RosterFilters", "export_roster", "list_roster"]
