"""Item B3: enriched admin graduate details.

The exceptional-actions page needs the ticket type, rejection reason, seat,
full payment data and per-code scanned state (with the scanning scanner) in a
single payload. The enrichment must stay additive: every previously returned
key keeps its position and shape.
"""

from datetime import UTC, datetime

from sqlalchemy import select

from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _admin(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return admin, {"Authorization": "Bearer " + response.json()["access_token"]}


async def test_enriched_details_expose_seat_payment_and_codes(
    client, make_admin, make_event, make_college, make_graduate, make_ticket, make_payment
):
    _, headers = await _admin(client, make_admin)
    event = await make_event(seat_prefix="E")
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, university_id="940001", email_verified=True)
    ticket = await make_ticket(graduate.id, event.id, status=TicketStatusEnum.PROCESSING)
    await make_payment(ticket.id, sender_name="أحمد المرسل")

    confirmed = await client.post(f"/api/admin/tickets/{ticket.id}/confirm", headers=headers)
    assert confirmed.status_code == 200, confirmed.text

    response = await client.get(f"/api/admin/graduates/{graduate.id}", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    # Pre-existing keys are preserved.
    assert body["id"] == graduate.id
    assert body["full_name"] == graduate.full_name

    details = body["tickets"][0]
    assert details["id"] == ticket.id
    assert details["event_id"] == event.id
    assert details["status"] == "CONFIRMED"
    assert "price" in details
    # B3 additions.
    assert details["ticket_type"] == "TWO_COMPANIONS"
    assert details["companions_count"] == 2
    assert details["rejection_reason"] is None
    assert details["confirmed_at"] is not None
    assert details["created_at"] is not None
    assert details["seat"] == {
        "graduate": "E-1",
        "companions": ["E-2", "E-3"],
        "range": "E-1 \u2192 E-3",
    }

    payment = body["payments"][0]
    assert payment["id"] is not None
    assert "transaction_number" in payment
    assert "amount" in payment
    assert payment["sender_name"] == "أحمد المرسل"
    assert payment["submitted_at"] is not None
    assert payment["reviewed_at"] is not None

    codes = body["qr_codes"]
    assert len(codes) == 3
    assert codes[0]["code_type"] == "GRADUATE"
    assert [c["code_type"] for c in codes[1:]] == ["COMPANION", "COMPANION"]
    assert "code_value" in codes[0]
    assert all(c["scanned"] is False for c in codes)
    assert all(c["scanned_at"] is None for c in codes)
    assert all(c["scanned_by_username"] is None for c in codes)


async def test_enriched_details_report_who_scanned(
    client,
    make_admin,
    make_event,
    make_college,
    make_graduate,
    make_ticket,
    make_payment,
    make_scanner,
    db,
):
    admin, headers = await _admin(client, make_admin)
    event = await make_event(seat_prefix="E")
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, university_id="940002", email_verified=True)
    ticket = await make_ticket(graduate.id, event.id, status=TicketStatusEnum.PROCESSING)
    await make_payment(ticket.id)
    confirmed = await client.post(f"/api/admin/tickets/{ticket.id}/confirm", headers=headers)
    assert confirmed.status_code == 200, confirmed.text

    scanner = await make_scanner(admin.id, event.id, username="scannerA")
    graduate_code = (
        await db.execute(
            select(QrCodeModel).where(
                QrCodeModel.ticket_id == ticket.id,
                QrCodeModel.code_type == QrCodeTypeEnum.GRADUATE,
            )
        )
    ).scalar_one()
    graduate_code.is_activated = True
    graduate_code.scanned_at = datetime.now(UTC)
    graduate_code.scanned_by_scanner_id = scanner.id
    await db.commit()

    response = await client.get(f"/api/admin/graduates/{graduate.id}", headers=headers)
    assert response.status_code == 200, response.text
    codes = response.json()["qr_codes"]

    scanned = [c for c in codes if c["code_type"] == "GRADUATE"][0]
    assert scanned["scanned"] is True
    assert scanned["scanned_at"] is not None
    assert scanned["scanned_by_username"] == "scannerA"
    assert all(c["scanned"] is False for c in codes if c["code_type"] == "COMPANION")


async def test_enriched_details_without_tickets(
    client, make_admin, make_event, make_college, make_graduate
):
    _, headers = await _admin(client, make_admin)
    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, university_id="940003")

    response = await client.get(f"/api/admin/graduates/{graduate.id}", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tickets"] == []
    assert body["payments"] == []
    assert body["qr_codes"] == []
