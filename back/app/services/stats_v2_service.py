"""Dashboard statistics (v2).

Every number is computed from the SAME joined rows as the admin roster page
(``roster_service._Parts``: one row per university record, left-joined with the
account, the ticket of that record's ceremony, the latest payment and the
graduate's QR code), so a number here always equals the total of the roster page
filtered the matching way.

Definitions (written for the Arabic labels of the dashboard):

* person            one (college, university id). "All ceremonies" counts a person once.
* confirmed account an account whose e-mail was confirmed with the OTP. Only
                    confirmed accounts are counted as registered everywhere.
* status            ticket state in THAT ceremony of a confirmed account:
                    confirmed | processing | awaiting_payment | rejected | no_ticket.
                    The five numbers add up to the confirmed accounts of the ceremony.
* attendance        confirmed tickets: the graduates plus the sum of their companions.
* entry             scanned QR codes of confirmed tickets (graduate and companions);
                    "manual" = the graduate was checked in by an admin, not scanned.
* finance           sum of the ticket prices (confirmed / processing).
* top students      records with an effective top rank (file value, else GPA rank).
* representation    answers of confirmed accounts to the two volunteer questions.
* colleges          per college: expected = people in the files, registered =
                    confirmed accounts, confirmed = people with a confirmed ticket.

The result is cached in Redis for a few seconds (10 s on a ceremony day) and the
cache is cleared by ``invalidate_admin_cache`` whenever an admin or a graduate
changes a ticket or a payment, so an admin's own action shows at once.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import and_, distinct, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core import messages
from app.core.redis import STATS_V2_CACHE_PREFIX, redis_client
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.payment import PaymentModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketModel, TicketStatusEnum
from app.models.university_record import UniversityRecordModel
from app.models.volunteer_answer import VolunteerAnswerModel
from app.services.roster_service import _Parts

CACHE_TTL_SECONDS = 30
CACHE_TTL_EVENT_DAY_SECONDS = 10
REVIEW_WINDOW_DAYS = 7

_R = UniversityRecordModel
_T = TicketModel
_S = TicketStatusEnum


def _money(value) -> str:
    return f"{Decimal(value or 0):.2f}"


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _count(cond=None):
    total = func.count()
    return total.filter(cond) if cond is not None else total


def _conditions(parts: _Parts) -> Dict[str, Any]:
    verified = GraduateModel.email_verified.is_(True)
    return {
        "verified": verified,
        "unverified": and_(GraduateModel.id.is_not(None), GraduateModel.email_verified.is_(False)),
        "confirmed": and_(verified, _T.status == _S.CONFIRMED),
        "processing": and_(verified, _T.status == _S.PROCESSING),
        "awaiting": and_(verified, _T.status == _S.AWAITING_PAYMENT),
        "rejected": and_(verified, _T.status == _S.REJECTED),
        "no_ticket": and_(verified, _T.id.is_(None)),
        "top": parts.eff_top != 0,
    }


def _scope(stmt, event_id: int | None):
    return stmt.where(_R.event_id == event_id) if event_id is not None else stmt


async def _per_event(db: AsyncSession, event_id: int | None, now: datetime) -> List[Dict[str, Any]]:
    parts = _Parts()
    c = _conditions(parts)
    qr = parts.qr
    stmt = parts.join(
        select(
            _R.event_id.label("event_id"),
            EventModel.name.label("event_name"),
            EventModel.event_date.label("event_date"),
            _count().label("records"),
            _count(c["verified"]).label("verified"),
            _count(c["unverified"]).label("unverified"),
            _count(c["confirmed"]).label("s_confirmed"),
            _count(c["processing"]).label("s_processing"),
            _count(c["awaiting"]).label("s_awaiting"),
            _count(c["rejected"]).label("s_rejected"),
            _count(c["no_ticket"]).label("s_none"),
            func.coalesce(func.sum(_T.companions_count).filter(c["confirmed"]), 0).label("companions"),
            func.coalesce(func.sum(_T.price).filter(c["confirmed"]), 0).label("money_confirmed"),
            func.coalesce(func.sum(_T.price).filter(c["processing"]), 0).label("money_processing"),
            _count(and_(c["confirmed"], qr.scanned_at.is_not(None))).label("grad_entered"),
            _count(
                and_(c["confirmed"], qr.scanned_at.is_not(None), qr.scanned_by_scanner_id.is_(None))
            ).label("grad_manual"),
            func.max(qr.scanned_at).filter(c["confirmed"]).label("last_scan"),
            func.min(parts.pay.submitted_at).filter(c["processing"]).label("oldest_pending"),
        )
    ).group_by(_R.event_id, EventModel.name, EventModel.event_date)
    rows = (await db.execute(_scope(stmt, event_id).order_by(EventModel.event_date, _R.event_id))).all()

    companion_qr = aliased(QrCodeModel)
    parts2 = _Parts()
    c2 = _conditions(parts2)
    comp_stmt = (
        parts2.join(
            select(
                _R.event_id.label("event_id"),
                _count(companion_qr.scanned_at.is_not(None)).label("comp_entered"),
                func.max(companion_qr.scanned_at).label("last_scan"),
            )
        )
        .join(
            companion_qr,
            and_(companion_qr.ticket_id == _T.id, companion_qr.code_type == QrCodeTypeEnum.COMPANION),
        )
        .where(c2["confirmed"])
        .group_by(_R.event_id)
    )
    companions = {
        r.event_id: (r.comp_entered, r.last_scan)
        for r in (await db.execute(_scope(comp_stmt, event_id))).all()
    }

    out: List[Dict[str, Any]] = []
    for r in rows:
        comp_entered, comp_last = companions.get(r.event_id, (0, None))
        last = max([d for d in (r.last_scan, comp_last) if d is not None], default=None)
        graduates = r.s_confirmed
        expected = graduates + int(r.companions)
        oldest = r.oldest_pending
        out.append(
            {
                "event_id": r.event_id,
                "event_name": r.event_name,
                "event_date": r.event_date.isoformat(),
                "expected_people": r.records,
                "registered": r.verified,
                "unverified": r.unverified,
                "status": {
                    "confirmed": r.s_confirmed,
                    "processing": r.s_processing,
                    "awaiting_payment": r.s_awaiting,
                    "rejected": r.s_rejected,
                    "no_ticket": r.s_none,
                },
                "attendance": {"graduates": graduates, "companions": int(r.companions), "expected": expected},
                "entry": {
                    "graduates_entered": r.grad_entered,
                    "companions_entered": comp_entered,
                    "entered": r.grad_entered + comp_entered,
                    "manual": r.grad_manual,
                    "expected": expected,
                    "last_entry_at": _iso(last),
                },
                "money_confirmed": _money(r.money_confirmed),
                "money_processing": _money(r.money_processing),
                "oldest_pending_at": _iso(oldest),
            }
        )
    return out


async def _people(db: AsyncSession, event_id: int | None) -> Dict[str, int]:
    parts = _Parts()
    c = _conditions(parts)
    person = func.concat(_R.college_id, "-", _R.university_id)
    stmt = parts.join(
        select(
            func.count(distinct(person)).filter(c["verified"]).label("confirmed_accounts"),
            func.count(distinct(person)).filter(c["unverified"]).label("unverified_accounts"),
            func.count(distinct(person)).filter(c["top"]).label("top_total"),
            func.count(distinct(person)).filter(and_(c["top"], c["verified"])).label("top_registered"),
            func.count(distinct(person)).filter(and_(c["top"], c["confirmed"])).label("top_confirmed"),
        )
    )
    row = (await db.execute(_scope(stmt, event_id))).one()
    return {k: int(getattr(row, k) or 0) for k in row._fields}


async def _representation(db: AsyncSession, event_id: int | None) -> Dict[str, int]:
    parts = _Parts()
    c = _conditions(parts)
    person = func.concat(_R.college_id, "-", _R.university_id)
    va = VolunteerAnswerModel
    stmt = (
        parts.join(
            select(
                func.count(distinct(person)).label("answered"),
                func.count(distinct(person)).filter(va.wants_responsibility.is_(True)).label("wants"),
                func.count(distinct(person)).filter(va.has_experience.is_(True)).label("experienced"),
                func.count(distinct(person))
                .filter(and_(va.wants_responsibility.is_(True), va.has_experience.is_(True)))
                .label("both"),
            )
        )
        .join(va, va.graduate_id == GraduateModel.id)
        .where(c["verified"])
    )
    row = (await db.execute(_scope(stmt, event_id))).one()
    return {k: int(getattr(row, k) or 0) for k in row._fields}


async def _by_package(db: AsyncSession, event_id: int | None) -> List[Dict[str, Any]]:
    parts = _Parts()
    c = _conditions(parts)
    stmt = (
        parts.join(
            select(
                _T.companions_count.label("companions_count"),
                func.count().label("tickets"),
                func.coalesce(func.sum(_T.price), 0).label("amount"),
            )
        )
        .where(c["confirmed"])
        .group_by(_T.companions_count)
        .order_by(_T.companions_count)
    )
    rows = (await db.execute(_scope(stmt, event_id))).all()
    return [
        {"companions_count": r.companions_count, "tickets": r.tickets, "amount": _money(r.amount)}
        for r in rows
    ]


async def _colleges(db: AsyncSession, event_id: int | None) -> List[Dict[str, Any]]:
    parts = _Parts()
    c = _conditions(parts)
    person = func.concat(_R.college_id, "-", _R.university_id)
    stmt = (
        parts.join(
            select(
                _R.college_id.label("college_id"),
                CollegeModel.name.label("name"),
                func.count(distinct(person)).label("expected"),
                func.count(distinct(person)).filter(c["verified"]).label("registered"),
                func.count(distinct(person)).filter(c["confirmed"]).label("confirmed"),
            )
        )
        .group_by(_R.college_id, CollegeModel.name)
        .order_by(CollegeModel.name)
    )
    rows = (await db.execute(_scope(stmt, event_id))).all()
    return [
        {"college_id": r.college_id, "name": r.name, "expected": r.expected,
         "registered": r.registered, "confirmed": r.confirmed}
        for r in rows
    ]


async def _review_speed(db: AsyncSession, event_id: int | None, now: datetime) -> Dict[str, Any]:
    stmt = (
        select(
            func.avg(extract("epoch", PaymentModel.reviewed_at - PaymentModel.submitted_at)),
            func.count(),
        )
        .join(_T, _T.id == PaymentModel.ticket_id)
        .where(
            PaymentModel.reviewed_at.is_not(None),
            PaymentModel.reviewed_at >= now - timedelta(days=REVIEW_WINDOW_DAYS),
        )
    )
    if event_id is not None:
        stmt = stmt.where(_T.event_id == event_id)
    avg_seconds, count = (await db.execute(stmt)).one()
    hours = round(float(avg_seconds) / 3600, 1) if avg_seconds is not None else None
    return {"avg_review_hours": hours, "reviewed_count": int(count or 0)}


async def _registration_close(db: AsyncSession, event_id: int | None, now: datetime) -> Dict[str, Any] | None:
    if event_id is not None:
        ev = await db.get(EventModel, event_id)
        return {"event_id": ev.id, "event_name": ev.name, "ends_at": _iso(ev.registration_end)}
    stmt = (
        select(EventModel.id, EventModel.name, EventModel.registration_end)
        .where(EventModel.registration_end > now)
        .order_by(EventModel.registration_end)
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    return {"event_id": row.id, "event_name": row.name, "ends_at": _iso(row.registration_end)}


async def compute_stats_v2(db: AsyncSession, event_id: int | None) -> Dict[str, Any]:
    now = datetime.now(UTC)
    events = await _per_event(db, event_id, now)
    people = await _people(db, event_id)
    representation = await _representation(db, event_id)
    packages = await _by_package(db, event_id)
    colleges = await _colleges(db, event_id)
    review = await _review_speed(db, event_id, now)
    closing = await _registration_close(db, event_id, now)

    def total(path: str, key: str) -> int:
        return sum(e[path][key] for e in events)

    status_total = {k: total("status", k) for k in
                    ("confirmed", "processing", "awaiting_payment", "rejected", "no_ticket")}
    attendance = {k: total("attendance", k) for k in ("graduates", "companions", "expected")}
    entry_counts = {k: total("entry", k) for k in
                    ("graduates_entered", "companions_entered", "entered", "manual", "expected")}
    last_entries = [e["entry"]["last_entry_at"] for e in events if e["entry"]["last_entry_at"]]
    entry = {**entry_counts, "last_entry_at": max(last_entries) if last_entries else None}

    pendings = [e["oldest_pending_at"] for e in events if e["oldest_pending_at"]]
    oldest_hours = None
    if pendings:
        oldest = datetime.fromisoformat(min(pendings))
        oldest_hours = round((now - oldest).total_seconds() / 3600, 1)

    damascus_today = (now + timedelta(hours=3)).date().isoformat()
    scope_name = events[0]["event_name"] if event_id is not None and events else None
    if event_id is not None and not events:
        ev = await db.get(EventModel, event_id)
        scope_name = ev.name if ev else None

    for e in events:  # internal helper field, not part of the answer
        e.pop("oldest_pending_at")

    return {
        "generated_at": now.isoformat(),
        "scope": {
            "event_id": event_id,
            "event_name": scope_name,
            "events_count": len(events),
            "event_day": any(e["event_date"] == damascus_today for e in events),
        },
        "attention": {
            "processing": status_total["processing"],
            "oldest_pending_hours": oldest_hours,
            "rejected": status_total["rejected"],
            "unverified": people["unverified_accounts"],
            "confirmed": status_total["confirmed"],
        },
        "registered": {
            "confirmed_accounts": people["confirmed_accounts"],
            "unverified_accounts": people["unverified_accounts"],
        },
        "status": status_total,
        "by_event": events,
        "attendance": attendance,
        "entry": entry,
        "finance": {
            "confirmed_amount": _money(sum(Decimal(e["money_confirmed"]) for e in events)),
            "processing_amount": _money(sum(Decimal(e["money_processing"]) for e in events)),
            "by_package": packages,
        },
        "top_students": {
            "total": people["top_total"],
            "registered": people["top_registered"],
            "confirmed": people["top_confirmed"],
        },
        "representation": representation,
        "colleges": colleges,
        "footer": {
            "confirmed_accounts": people["confirmed_accounts"],
            "registration": closing,
            **review,
        },
    }


async def get_stats_v2_service(db: AsyncSession, event_id: int | None) -> Dict[str, Any]:
    if event_id is not None and await db.get(EventModel, event_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=messages.EVENT_NOT_FOUND)

    key = f"{STATS_V2_CACHE_PREFIX}:{event_id if event_id is not None else 'all'}"
    try:
        cached = await redis_client.get(key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    data = await compute_stats_v2(db, event_id)
    ttl = CACHE_TTL_EVENT_DAY_SECONDS if data["scope"]["event_day"] else CACHE_TTL_SECONDS
    try:
        await redis_client.setex(key, ttl, json.dumps(data))
    except Exception:
        pass
    return data
