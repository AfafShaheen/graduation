import json
from datetime import UTC, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException, status
from app.models.graduate import GraduateModel
from app.models.ticket import TicketModel, TicketStatusEnum
from app.models.payment import PaymentModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.audit_log import AuditLogModel
from app.core.redis import redis_client


async def invalidate_admin_cache() -> None:
    """Invalidate all admin graduation and ticket related Redis caches."""
    try:
        keys = await redis_client.keys("admin:graduates:*")
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass


async def write_audit_log(
    db: AsyncSession,
    admin_id: int,
    action: str,
    target: str,
    details: str
) -> None:
    """Atomically write audit log entry in the same transaction (FR-22)."""
    log_entry = AuditLogModel(
        actor_type="ADMIN",
        actor_id=admin_id,
        action=action,
        target=target,
        details=details
    )
    db.add(log_entry)


async def search_graduates_service(
    db: AsyncSession,
    search: str | None = None,
    college_id: int | None = None,
    skip: int = 0,
    limit: int = 50
) -> list[dict]:
    cache_key = f"admin:graduates:list:{search}:{college_id}:{skip}:{limit}"
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    stmt = select(GraduateModel)
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            (GraduateModel.full_name.ilike(search_pattern)) |
            (GraduateModel.university_id.ilike(search_pattern))
        )
    if college_id:
        stmt = stmt.where(GraduateModel.college_id == college_id)

    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    graduates = result.scalars().all()

    # Convert to dict for serialization
    data = [
        {
            "id": g.id,
            "full_name": g.full_name,
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
        }
        for g in graduates
    ]

    try:
        await redis_client.setex(cache_key, 300, json.dumps(data))
    except Exception:
        pass

    return data


async def get_graduate_full_details_service(db: AsyncSession, graduate_id: int) -> dict:
    cache_key = f"admin:graduates:detail:{graduate_id}"
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    grad = await db.get(GraduateModel, graduate_id)
    if not grad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الخريج.")

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

    result = {
        "id": grad.id,
        "full_name": grad.full_name,
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
        "tickets": [{"id": t.id, "event_id": t.event_id, "status": t.status, "price": str(t.price)} for t in tickets],
        "payments": [{"id": p.id, "ticket_id": p.ticket_id, "transaction_number": p.transaction_number, "amount": str(p.amount)} for p in payments],
        "qr_codes": [{"id": q.id, "ticket_id": q.ticket_id, "code_type": q.code_type, "code_value": str(q.code_value), "is_activated": q.is_activated} for q in qr_codes],
    }

    try:
        await redis_client.setex(cache_key, 300, json.dumps(result))
    except Exception:
        pass

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

    # Atomic audit log
    await write_audit_log(
        db,
        admin_id=admin["admin_id"],
        action="UPDATE_EMAIL",
        target=f"Graduate ID {graduate_id}",
        details=f"Changed email from {old_email} to {new_email}"
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

    qr_res = await db.execute(
        select(QrCodeModel).where(
            QrCodeModel.ticket_id == ticket_id,
            QrCodeModel.code_type == QrCodeTypeEnum.GRADUATE.value
        )
    )
    grad_qr = qr_res.scalar_one_or_none()
    if not grad_qr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="رمز الاستجابة السريعة للخريج غير موجود.")

    now = datetime.now(UTC)
    grad_qr.is_activated = True
    grad_qr.scanned_at = now
    db.add(grad_qr)

    # Activate companion QRs (UC-12)
    comp_res = await db.execute(
        select(QrCodeModel).where(
            QrCodeModel.ticket_id == ticket_id,
            QrCodeModel.code_type == QrCodeTypeEnum.COMPANION.value,
            QrCodeModel.is_activated.is_(False)
        )
    )
    comp_qrs = comp_res.scalars().all()
    for cq in comp_qrs:
        cq.is_activated = True
        db.add(cq)

    await write_audit_log(
        db,
        admin_id=admin["admin_id"],
        action="MANUAL_CHECK_IN",
        target=f"Graduate ID {graduate_id}",
        details=f"Manual check-in override by admin. Activated graduate and {len(comp_qrs)} companion QR(s)."
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
            QrCodeModel.code_type == QrCodeTypeEnum.GRADUATE.value
        )
    )
    grad_qr = qr_res.scalar_one_or_none()
    if not grad_qr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="رمز الاستجابة السريعة للخريج غير موجود.")

    grad_qr.is_activated = False
    grad_qr.scanned_at = None
    grad_qr.scanned_by_scanner_id = None
    db.add(grad_qr)

    # Deactivate companion QRs
    comp_res = await db.execute(
        select(QrCodeModel).where(
            QrCodeModel.ticket_id == ticket_id,
            QrCodeModel.code_type == QrCodeTypeEnum.COMPANION.value
        )
    )
    comp_qrs = comp_res.scalars().all()
    for cq in comp_qrs:
        cq.is_activated = False
        cq.scanned_at = None
        cq.scanned_by_scanner_id = None
        db.add(cq)

    await write_audit_log(
        db,
        admin_id=admin["admin_id"],
        action="REVERT_SCAN",
        target=f"Graduate ID {graduate_id}",
        details=f"Reverted scan for graduate and {len(comp_qrs)} companion QR(s)."
    )

    await db.commit()
    await invalidate_admin_cache()

    return {"status": "success", "message": "تم إلغاء مسح الرمز بنجاح."}


async def revert_payment_service(db: AsyncSession, ticket_id: int, admin: dict) -> dict:
    ticket = await db.get(TicketModel, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على التذكرة.")

    ticket.status = TicketStatusEnum.PROCESSING.value
    ticket.confirmed_at = None
    db.add(ticket)

    await write_audit_log(
        db,
        admin_id=admin["admin_id"],
        action="REVERT_PAYMENT",
        target=f"Ticket ID {ticket_id}",
        details=f"Reverted ticket status from CONFIRMED to PROCESSING for graduate ID {ticket.graduate_id}"
    )

    await db.commit()
    await invalidate_admin_cache()

    return {"status": "success", "message": "تم إرجاع حالة الدفع إلى قيد المعالجة بنجاح."}
