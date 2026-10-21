from datetime import UTC, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.models.ticket import TicketModel, TicketStatusEnum
from app.models.payment import PaymentModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.college import CollegeModel
from app.models.major import MajorModel
from app.models.event import EventModel
from app.models.scanner import ScannerModel
from app.models.volunteer_answer import VolunteerAnswerModel
from app.services.qr_service import activate_companion_codes
from app.services.seat_service import seat_labels
from app.services.audit_log import ActorType, record_audit
from app.services.college_links import colleges_of_event_filter, resolve_college_event
from app.core import messages
from app.core.redis import redis_client
from app.core.sql_utils import escape_like


async def invalidate_admin_cache() -> None:
    """Invalidate all admin graduation and ticket related Redis caches."""
    try:
        keys = await redis_client.keys("admin:graduates:*")
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass


async def search_graduates_service(
    db: AsyncSession,
    search: str | None = None,
    college_id: int | None = None,
    top_rank: str | None = None,
    wants_responsibility: str | None = None,
    has_experience: str | None = None,
    volunteer_answered: bool | None = None,
    event_id: int | None = None,
    major_id: int | None = None,
    skip: int = 0,
    limit: int = 50
) -> list[dict]:
    if event_id is not None:
        ev = await db.get(EventModel, event_id)
        if not ev:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=messages.EVENT_NOT_FOUND)

    stmt = (
        select(GraduateModel, CollegeModel, MajorModel, VolunteerAnswerModel)
        .join(CollegeModel, CollegeModel.id == GraduateModel.college_id)
        .outerjoin(MajorModel, MajorModel.id == GraduateModel.major_id)
        .outerjoin(VolunteerAnswerModel, VolunteerAnswerModel.graduate_id == GraduateModel.id)
    )

    filters = []
    if event_id is not None:
        filters.append(colleges_of_event_filter(event_id))
    if college_id is not None:
        filters.append(GraduateModel.college_id == college_id)
    if major_id is not None:
        filters.append(GraduateModel.major_id == major_id)
    if top_rank is not None:
        if top_rank in ("1", "2", "3"):
            filters.append(GraduateModel.top_rank == int(top_rank))
        elif top_rank == "any":
            filters.append(GraduateModel.top_rank.is_not(None))
        elif top_rank == "none":
            filters.append(GraduateModel.top_rank.is_(None))
    if volunteer_answered is not None:
        if volunteer_answered:
            filters.append(VolunteerAnswerModel.id.is_not(None))
        else:
            filters.append(VolunteerAnswerModel.id.is_(None))
    if wants_responsibility is not None:
        # Semantics: matching "no" matches explicitly answered no, not un-answered graduates (who have NULL row)
        filters.append(VolunteerAnswerModel.wants_responsibility.is_(wants_responsibility == "yes"))
    if has_experience is not None:
        filters.append(VolunteerAnswerModel.has_experience.is_(has_experience == "yes"))
    if search:
        pattern = f"%{escape_like(search)}%"
        filters.append(
            or_(
                GraduateModel.full_name.ilike(pattern, escape="\\"),
                GraduateModel.university_id.ilike(pattern, escape="\\"),
            )
        )

    if filters:
        stmt = stmt.where(*filters)

    stmt = stmt.order_by(GraduateModel.id.asc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    # Convert to dict for serialization
    data = [
        {
            "id": g.id,
            "full_name": g.full_name,
            "first_name": g.first_name,
            "last_name": g.last_name,
            "gender": g.gender,
            "college_id": g.college_id,
            "email": g.email,
            "phone": g.phone,
            "email_verified": g.email_verified,
            "father_name": g.father_name,
            "mother_name": g.mother_name,
            "university_id": g.university_id,
            "unique_graduate_code": str(g.unique_graduate_code),
            "created_at": g.created_at.isoformat() if g.created_at else None,
            "major_id": g.major_id,
            "major_name": major.name if major else None,
            "gpa": str(g.gpa) if g.gpa is not None else None,
            "top_rank": g.top_rank,
            "wants_responsibility": ("yes" if va.wants_responsibility else "no") if va is not None else None,
            "has_experience": ("yes" if va.has_experience else "no") if va is not None else None,
            "volunteer_answered": va is not None,
        }
        for g, college, major, va in rows
    ]

    return data


async def get_graduate_full_details_service(db: AsyncSession, graduate_id: int) -> dict:
    stmt = (
        select(GraduateModel, CollegeModel, MajorModel, VolunteerAnswerModel)
        .join(CollegeModel, CollegeModel.id == GraduateModel.college_id)
        .outerjoin(MajorModel, MajorModel.id == GraduateModel.major_id)
        .outerjoin(VolunteerAnswerModel, VolunteerAnswerModel.graduate_id == GraduateModel.id)
        .where(GraduateModel.id == graduate_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الخريج.")
    grad, college, major, va = row

    # Fetch related tickets, payments, qr_codes
    tickets_res = await db.execute(select(TicketModel).where(TicketModel.graduate_id == graduate_id))
    tickets = tickets_res.scalars().all()

    ticket_ids = [t.id for t in tickets]
    payments = []
    qr_codes = []
    if ticket_ids:
        pay_res = await db.execute(select(PaymentModel).where(PaymentModel.ticket_id.in_(ticket_ids)))
        payments = pay_res.scalars().all()

        qr_res = await db.execute(select(QrCodeModel).where(QrCodeModel.ticket_id.in_(ticket_ids)))
        qr_codes = qr_res.scalars().all()

    # Event seat prefixes for this graduate's tickets (one batch query, no N+1).
    event_ids = {t.event_id for t in tickets if t.event_id is not None}
    seat_prefixes: dict[int, str | None] = {}
    if event_ids:
        event_res = await db.execute(
            select(EventModel.id, EventModel.seat_prefix).where(EventModel.id.in_(event_ids))
        )
        seat_prefixes = {row[0]: row[1] for row in event_res.all()}

    # Scanner usernames for the codes that were scanned (one batch query).
    scanner_ids = {
        q.scanned_by_scanner_id for q in qr_codes if q.scanned_by_scanner_id is not None
    }
    scanner_names: dict[int, str] = {}
    if scanner_ids:
        scanner_res = await db.execute(
            select(ScannerModel.id, ScannerModel.username).where(ScannerModel.id.in_(scanner_ids))
        )
        scanner_names = {row[0]: row[1] for row in scanner_res.all()}

    # The graduate code is always shown first, then companions by id (FR-12).
    ordered_qr_codes = sorted(
        qr_codes, key=lambda q: (q.code_type != QrCodeTypeEnum.GRADUATE, q.id)
    )

    result = {
        "id": grad.id,
        "full_name": grad.full_name,
        "first_name": grad.first_name,
        "last_name": grad.last_name,
        "gender": grad.gender,
        "college_id": grad.college_id,
        "email": grad.email,
        "phone": grad.phone,
        "email_verified": grad.email_verified,
        "father_name": grad.father_name,
        "mother_name": grad.mother_name,
        "university_id": grad.university_id,
        "unique_graduate_code": str(grad.unique_graduate_code),
        "created_at": grad.created_at.isoformat() if grad.created_at else None,
        "major_id": grad.major_id,
        "major_name": major.name if major else None,
        "gpa": str(grad.gpa) if grad.gpa is not None else None,
        "top_rank": grad.top_rank,
        "wants_responsibility": ("yes" if va.wants_responsibility else "no") if va is not None else None,
        "has_experience": ("yes" if va.has_experience else "no") if va is not None else None,
        "volunteer_answered": va is not None,
        "tickets": [
            {
                "id": t.id,
                "event_id": t.event_id,
                "status": t.status,
                "price": str(t.price),
                "companions_count": t.companions_count,
                "rejection_reason": t.rejection_reason,
                "confirmed_at": t.confirmed_at.isoformat() if t.confirmed_at else None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "seat": seat_labels(
                    seat_prefixes.get(t.event_id), t.seat_start, t.companions_count
                ),
            }
            for t in tickets
        ],
        "payments": [
            {
                "id": p.id,
                "ticket_id": p.ticket_id,
                "transaction_number": p.transaction_number,
                "amount": str(p.amount),
                "sender_name": p.sender_name,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
                "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
            }
            for p in payments
        ],
        "qr_codes": [
            {
                "id": q.id,
                "ticket_id": q.ticket_id,
                "code_type": q.code_type,
                "code_value": str(q.code_value),
                "is_activated": q.is_activated,
                "scanned": q.scanned_at is not None,
                "scanned_at": q.scanned_at.isoformat() if q.scanned_at else None,
                "scanned_by_username": scanner_names.get(q.scanned_by_scanner_id),
            }
            for q in ordered_qr_codes
        ],
    }

    return result


async def admin_force_update_email_service(db: AsyncSession, graduate_id: int, new_email: str, admin: dict) -> dict:
    grad = await db.get(GraduateModel, graduate_id)
    if not grad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الخريج.")

    # Check email uniqueness
    existing = await db.execute(select(GraduateModel).where(GraduateModel.email == new_email, GraduateModel.id != graduate_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="البريد الإلكتروني مستخدم بالفعل من قبل حساب آخر.")

    old_email = grad.email
    grad.email = new_email
    db.add(grad)

    # Atomic audit log (D21: structured event/graduate refs)
    resolved = await resolve_college_event(db, grad.college_id) if grad.college_id else None
    event_id = resolved.id if resolved else None
    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "UPDATE_EMAIL",
        f"Graduate ID {graduate_id}",
        f"Changed email from {old_email} to {new_email}",
        event_id=event_id,
        graduate_id=graduate_id,
    )

    await db.commit()
    await invalidate_admin_cache()

    return {"status": "success", "message": "تم تحديث البريد الإلكتروني بنجاح."}


async def manual_check_in_service(db: AsyncSession, graduate_id: int, admin: dict) -> dict:
    # Find graduate ticket and QR code
    tickets_res = await db.execute(select(TicketModel).where(TicketModel.graduate_id == graduate_id))
    tickets = tickets_res.scalars().all()
    if not tickets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لا توجد تذاكر لهذا الخريج.")

    ticket_id = tickets[0].id

    # FR-22-a/c: manual check-in is only allowed for a confirmed ticket.
    if tickets[0].status != TicketStatusEnum.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=messages.MANUAL_CHECKIN_TICKET_NOT_CONFIRMED,
        )

    qr_res = await db.execute(
        select(QrCodeModel).where(
            QrCodeModel.ticket_id == ticket_id,
            QrCodeModel.code_type == QrCodeTypeEnum.GRADUATE
        )
    )
    grad_qr = qr_res.scalar_one_or_none()
    if not grad_qr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="رمز الاستجابة السريعة للخريج غير موجود.")

    if grad_qr.scanned_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.ALREADY_CHECKED_IN)

    grad_qr.is_activated = True
    grad_qr.scanned_at = datetime.now(UTC)
    # An admin override is not a scanner event, so no scanner id is recorded.
    # The DB check allows a NULL scanner as long as scanned_at is set.
    grad_qr.scanned_by_scanner_id = None
    db.add(grad_qr)

    # Activate companion QRs (UC-12), reusing the QR service so the rules stay
    # in one place.
    activated_count = await activate_companion_codes(db, ticket_id)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "MANUAL_CHECK_IN",
        f"Graduate ID {graduate_id}",
        f"Manual check-in override by admin. Activated graduate and {activated_count} companion QR(s).",
        event_id=tickets[0].event_id,
        graduate_id=graduate_id,
        ticket_id=ticket_id,
    )

    await db.commit()
    await invalidate_admin_cache()

    return {"status": "success", "message": "تم تسجيل الدخول اليدوي وتفعيل رموز المرافقين بنجاح."}


async def revert_scan_service(db: AsyncSession, graduate_id: int, admin: dict) -> dict:
    tickets_res = await db.execute(select(TicketModel).where(TicketModel.graduate_id == graduate_id))
    tickets = tickets_res.scalars().all()
    if not tickets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لا توجد تذاكر لهذا الخريج.")

    ticket_id = tickets[0].id

    qr_res = await db.execute(
        select(QrCodeModel).where(
            QrCodeModel.ticket_id == ticket_id,
            QrCodeModel.code_type == QrCodeTypeEnum.GRADUATE
        )
    )
    grad_qr = qr_res.scalar_one_or_none()
    if not grad_qr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="رمز الاستجابة السريعة للخريج غير موجود.")

    comp_res = await db.execute(
        select(QrCodeModel).where(
            QrCodeModel.ticket_id == ticket_id,
            QrCodeModel.code_type == QrCodeTypeEnum.COMPANION
        )
    )
    comp_qrs = comp_res.scalars().all()

    scanned_companions = [cq for cq in comp_qrs if cq.scanned_at is not None]
    if grad_qr.scanned_at is None and not scanned_companions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.NOTHING_TO_REVERT)

    # D5: the graduate code stays activated after a revert so the graduate can
    # be scanned again; only its scan markers are cleared. Companion codes are
    # frozen again so they must follow the graduate anew.
    grad_qr.is_activated = True
    grad_qr.scanned_at = None
    grad_qr.scanned_by_scanner_id = None
    db.add(grad_qr)

    for cq in comp_qrs:
        cq.is_activated = False
        cq.scanned_at = None
        cq.scanned_by_scanner_id = None
        db.add(cq)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "REVERT_SCAN",
        f"Graduate ID {graduate_id}",
        f"Reverted scan for graduate and {len(comp_qrs)} companion QR(s).",
        event_id=tickets[0].event_id,
        graduate_id=graduate_id,
        ticket_id=ticket_id,
    )

    await db.commit()
    await invalidate_admin_cache()

    return {"status": "success", "message": "تم إلغاء مسح الرمز بنجاح."}


async def revert_payment_service(db: AsyncSession, ticket_id: int, admin: dict) -> dict:
    ticket = await db.get(TicketModel, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على التذكرة.")

    if ticket.status != TicketStatusEnum.CONFIRMED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=messages.PAYMENT_NOT_REVERTIBLE)

    ticket.status = TicketStatusEnum.PROCESSING
    ticket.confirmed_at = None
    db.add(ticket)

    # The QR rows are intentionally kept: the "my ticket" endpoint (M2) exposes
    # NO code values or WhatsApp link for any status other than CONFIRMED, so a
    # code of a no-longer-confirmed ticket can never be shown; on re-confirmation
    # the SAME code values become visible and scannable again.
    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "REVERT_PAYMENT",
        f"Ticket ID {ticket_id}",
        f"Reverted ticket status from CONFIRMED to PROCESSING for graduate ID {ticket.graduate_id}",
        event_id=ticket.event_id,
        graduate_id=ticket.graduate_id,
        ticket_id=ticket_id,
    )

    await db.commit()
    await invalidate_admin_cache()

    return {"status": "success", "message": "تم إرجاع حالة الدفع إلى قيد المعالجة بنجاح."}
