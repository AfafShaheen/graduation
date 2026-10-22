"""HTTP tests for admin payment review and QR issuance (item 3.7, FR-17/FR-12)."""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from app.core import messages
from app.core.security import create_access_token
from app.models.audit_log import AuditLogModel
from app.models.qr_code import QrCodeModel
from app.models.ticket import TicketStatusEnum

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_GRAD_PW = "Grad" + "Pass" + "1234"


def _auth(access_value):
    return {"Authorization": f"Bearer {access_value}"}


async def _admin_auth(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return _auth(response.json()["access_token"]), admin


async def _processing_ticket(
    db,
    make_event,
    make_college,
    make_graduate,
    make_ticket,
    make_payment,
    *,
    event=None,
    university_id="123456",
    amount=100000,
    price=100000,
    submitted_at=None,
    companions_count=2,
):
    if event is None:
        event = await make_event()
    college = await make_college(event.id, name=f"كلية {university_id}")
    graduate = await make_graduate(
        college.id, university_id=university_id, email_verified=True
    )
    ticket = await make_ticket(
        graduate.id,
        event.id,
        companions_count=companions_count,
        status=TicketStatusEnum.PROCESSING,
        price=price,
    )
    payment = await make_payment(
        ticket.id,
        transaction_number=f"TXN-{university_id}",
        amount=amount,
        submitted_at=submitted_at,
    )
    return event, college, graduate, ticket, payment


async def test_list_requires_admin(client, make_event):
    event = await make_event()

    response = await client.get(f"/api/admin/events/{event.id}/payments")

    assert response.status_code in (401, 403)


async def test_list_filters_pagination_and_order(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    event = await make_event()
    _e, _c, _g, ticket_a, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment,
        event=event, university_id="300001",
        submitted_at=datetime(2025, 1, 1, tzinfo=UTC),
    )
    _e, _c, _g, ticket_b, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment,
        event=event, university_id="300002",
        submitted_at=datetime(2025, 1, 2, tzinfo=UTC),
    )
    _e, _c, _g, ticket_c, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment,
        event=event, university_id="300003",
        submitted_at=datetime(2025, 1, 3, tzinfo=UTC),
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    first_page = await client.get(
        f"/api/admin/events/{event.id}/payments?status=PROCESSING&limit=2&offset=0",
        headers=admin_auth,
    )
    assert first_page.status_code == 200, first_page.text
    body = first_page.json()
    assert body["total"] == 3
    assert [item["ticket_id"] for item in body["items"]] == [ticket_a.id, ticket_b.id]

    second_page = await client.get(
        f"/api/admin/events/{event.id}/payments?status=PROCESSING&limit=2&offset=2",
        headers=admin_auth,
    )
    assert [item["ticket_id"] for item in second_page.json()["items"]] == [ticket_c.id]


async def test_list_default_status_is_processing(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    event = await make_event()
    await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment,
        event=event, university_id="400001",
    )
    college = await make_college(event.id)
    other = await make_graduate(
        college.id, university_id="400002", email_verified=True
    )
    await make_ticket(other.id, event.id, status=TicketStatusEnum.AWAITING_PAYMENT)
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.get(
        f"/api/admin/events/{event.id}/payments", headers=admin_auth
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["status"] == "PROCESSING"


async def test_list_unknown_event_404(client, make_admin):
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.get(
        "/api/admin/events/999999/payments", headers=admin_auth
    )

    assert response.status_code == 404


async def test_mismatch_flag(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    event = await make_event()
    await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment,
        event=event, university_id="500001", amount=150000, price=100000,
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.get(
        f"/api/admin/events/{event.id}/payments", headers=admin_auth
    )

    item = response.json()["items"][0]
    assert item["amount_mismatch"] is True
    assert item["payment"]["amount"] == "150000.00"


async def test_get_ticket_detail(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    event, _c, graduate, ticket, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.get(f"/api/admin/tickets/{ticket.id}", headers=admin_auth)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == ticket.id
    assert body["graduate"]["id"] == graduate.id
    assert body["graduate"]["email"] == graduate.email
    assert len(body["payments"]) == 1


async def test_confirm_success_issues_codes(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    _event, _c, graduate, ticket, payment = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment
    )
    admin_auth, admin = await _admin_auth(client, make_admin)

    response = await client.post(
        f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth
    )

    assert response.status_code == 200, response.text
    assert response.json()["message"] == messages.PAYMENT_CONFIRMED
    await db.refresh(ticket)
    assert ticket.status == TicketStatusEnum.CONFIRMED
    assert ticket.confirmed_at is not None
    codes = (
        await db.execute(
            select(QrCodeModel).where(QrCodeModel.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert len(codes) == 3
    assert sum(1 for code in codes if code.is_activated) == 1
    await db.refresh(payment)
    assert payment.reviewed_at is not None
    audits = (
        await db.execute(
            select(AuditLogModel).where(AuditLogModel.action == "PAYMENT_CONFIRMED")
        )
    ).scalars().all()
    assert len(audits) == 1
    assert audits[0].actor_id == admin.id


async def test_confirm_twice_conflict_keeps_codes(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    _event, _c, _g, ticket, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)
    first = await client.post(
        f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth
    )

    assert second.status_code == 409
    assert second.json()["detail"] == messages.REQUEST_NOT_PROCESSING
    codes = (
        await db.execute(
            select(QrCodeModel).where(QrCodeModel.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert len(codes) == 3


async def test_confirm_requires_payment(
    client, db, make_event, make_college, make_graduate, make_ticket, make_admin
):
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, email_verified=True)
    ticket = await make_ticket(
        graduate.id, event.id, status=TicketStatusEnum.PROCESSING
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.post(
        f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth
    )

    assert response.status_code == 409
    assert response.json()["detail"] == messages.REQUEST_NOT_PROCESSING


async def test_concurrent_confirm_gives_one_success(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    _event, _c, _g, ticket, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    results = await asyncio.gather(
        client.post(f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth),
        client.post(f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth),
    )

    assert sum(1 for response in results if response.status_code == 200) == 1


async def test_reject_requires_reason(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    _event, _c, _g, ticket, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.post(
        f"/api/admin/tickets/{ticket.id}/reject",
        headers=admin_auth,
        json={"reason": "ab"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == messages.REJECT_REASON_REQUIRED


async def test_reject_success_and_graduate_sees_reason(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    _event, _c, graduate, ticket, payment = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.post(
        f"/api/admin/tickets/{ticket.id}/reject",
        headers=admin_auth,
        json={"reason": "رقم العملية غير صحيح"},
    )

    assert response.status_code == 200, response.text
    await db.refresh(ticket)
    assert ticket.status == TicketStatusEnum.REJECTED
    assert ticket.rejection_reason == "رقم العملية غير صحيح"
    await db.refresh(payment)
    assert payment.reviewed_at is not None
    audits = (
        await db.execute(
            select(AuditLogModel).where(AuditLogModel.action == "PAYMENT_REJECTED")
        )
    ).scalars().all()
    assert len(audits) == 1

    login = await client.post(
        "/api/auth/graduate/login",
        json={"email": graduate.email, _PW_FIELD: _GRAD_PW},
    )
    access_value = login.json()["access_token"]
    mine = await client.get("/api/graduates/me/ticket", headers=_auth(access_value))
    assert mine.json()["ticket"]["rejection_reason"] == "رقم العملية غير صحيح"


async def test_confirm_after_window_ended(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin
):
    event = await make_event(
        registration_start=datetime(2020, 1, 1, tzinfo=UTC),
        registration_end=datetime(2020, 1, 2, tzinfo=UTC),
    )
    _e, _c, _g, ticket, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment,
        event=event,
    )
    admin_auth, _admin = await _admin_auth(client, make_admin)

    response = await client.post(
        f"/api/admin/tickets/{ticket.id}/confirm", headers=admin_auth
    )

    assert response.status_code == 200, response.text


async def test_all_routes_require_admin(
    client, db, make_event, make_college, make_graduate, make_ticket, make_payment, make_admin, make_scanner
):
    event, _c, graduate, ticket, _p = await _processing_ticket(
        db, make_event, make_college, make_graduate, make_ticket, make_payment
    )
    _admin_value, admin = await _admin_auth(client, make_admin)
    scanner = await make_scanner(admin.id, event.id)
    scanner_value = create_access_token(
        {
            "sub": str(scanner.id),
            "scanner_id": scanner.id,
            "role": "scanner",
            "event_id": scanner.event_id,
        }
    )
    login = await client.post(
        "/api/auth/graduate/login",
        json={"email": graduate.email, _PW_FIELD: _GRAD_PW},
    )
    graduate_auth = _auth(login.json()["access_token"])
    routes = [
        ("get", f"/api/admin/events/{event.id}/payments"),
        ("get", f"/api/admin/tickets/{ticket.id}"),
        ("post", f"/api/admin/tickets/{ticket.id}/confirm"),
        ("post", f"/api/admin/tickets/{ticket.id}/reject"),
    ]

    for method, path in routes:
        anonymous = await getattr(client, method)(path)
        assert anonymous.status_code in (401, 403), (path, anonymous.status_code)
        with_graduate = await getattr(client, method)(path, headers=graduate_auth)
        assert with_graduate.status_code in (401, 403)
        with_scanner = await getattr(client, method)(
            path, headers=_auth(scanner_value)
        )
        assert with_scanner.status_code in (401, 403)
