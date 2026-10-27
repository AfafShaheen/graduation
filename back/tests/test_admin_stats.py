from app.core.security import create_access_token
from app.models.ticket import TicketStatusEnum

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


def _auth(value):
    return {"Authorization": f"Bearer {value}"}


async def _admin_headers(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200
    return _auth(response.json()["access_token"])


async def _seed_event_one(make_event, make_college, make_university_record, make_graduate, make_ticket, make_payment):
    event = await make_event(name="حفل أ")
    college_a = await make_college(event.id, name="كلية أ")
    college_b = await make_college(event.id, name="كلية ب")
    await make_university_record(event.id, college_a.id, university_id="1001")
    await make_university_record(event.id, college_a.id, university_id="1002")
    await make_university_record(event.id, college_a.id, university_id="1003")
    await make_university_record(event.id, college_b.id, university_id="2001")
    await make_university_record(event.id, college_b.id, university_id="2002")

    grad_1 = await make_graduate(college_a.id, university_id="1001", email_verified=True)
    grad_2 = await make_graduate(college_b.id, university_id="2001", email_verified=True)
    grad_3 = await make_graduate(college_a.id, university_id="1002", email_verified=True)
    grad_4 = await make_graduate(college_b.id, university_id="2002", email_verified=True)

    ticket_1 = await make_ticket(grad_1.id, event.id, companions_count=2, status=TicketStatusEnum.CONFIRMED)
    await make_payment(ticket_1.id, transaction_number="TXN-1")
    ticket_2 = await make_ticket(grad_2.id, event.id, companions_count=3, status=TicketStatusEnum.PROCESSING)
    await make_payment(ticket_2.id, transaction_number="TXN-2")
    await make_ticket(grad_3.id, event.id, companions_count=2, status=TicketStatusEnum.AWAITING_PAYMENT)
    ticket_4 = await make_ticket(grad_4.id, event.id, companions_count=3, status=TicketStatusEnum.REJECTED)
    await make_payment(ticket_4.id, transaction_number="TXN-3")

    return event, college_a, college_b


async def test_stats_single_event_numbers(
    client, make_admin, make_event, make_college, make_university_record, make_graduate, make_ticket, make_payment
):
    headers = await _admin_headers(client, make_admin)
    event, college_a, college_b = await _seed_event_one(
        make_event, make_college, make_university_record, make_graduate, make_ticket, make_payment
    )

    response = await client.get(f"/api/admin/stats?event_id={event.id}", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["scope"] == {"event_id": event.id, "event_name": "حفل أ"}
    assert "per_event" not in data
    assert data["graduates"] == {"expected": 5, "registered": 4, "not_registered": 1}
    assert data["tickets"] == {
        "payment_submitted": 3,
        "confirmed": 1,
        "rejected": 1,
        "processing": 1,
        "awaiting_payment": 1,
        "not_paid_yet": 1,
    }
    assert data["ticket_types"] == {
        "2": {"total": 2, "confirmed": 1},
        "3": {"total": 2, "confirmed": 0},
    }
    assert data["expected_attendance"] == {"confirmed": 3, "processing": 4}
    assert data["by_college"] == [
        {"college_id": college_a.id, "college_name": "كلية أ", "expected": 3, "registered": 2, "tickets_confirmed": 1},
        {"college_id": college_b.id, "college_name": "كلية ب", "expected": 2, "registered": 2, "tickets_confirmed": 0},
    ]


async def test_stats_all_events_aggregates_and_per_event(
    client, make_admin, make_event, make_college, make_university_record, make_graduate, make_ticket, make_payment
):
    headers = await _admin_headers(client, make_admin)
    event_one, college_a, college_b = await _seed_event_one(
        make_event, make_college, make_university_record, make_graduate, make_ticket, make_payment
    )

    event_two = await make_event(name="حفل ب")
    college_c = await make_college(event_two.id, name="كلية ج")
    await make_university_record(event_two.id, college_c.id, university_id="3001")

    response = await client.get("/api/admin/stats", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["scope"] == {"event_id": None, "event_name": None}
    assert data["graduates"] == {"expected": 6, "registered": 4, "not_registered": 2}
    assert data["tickets"]["payment_submitted"] == 3
    assert data["tickets"]["not_paid_yet"] == 1
    assert data["ticket_types"] == {
        "2": {"total": 2, "confirmed": 1},
        "3": {"total": 2, "confirmed": 0},
    }
    assert data["expected_attendance"] == {"confirmed": 3, "processing": 4}
    assert data["by_college"] == [
        {"college_id": college_a.id, "college_name": "كلية أ", "expected": 3, "registered": 2, "tickets_confirmed": 1},
        {"college_id": college_b.id, "college_name": "كلية ب", "expected": 2, "registered": 2, "tickets_confirmed": 0},
        {"college_id": college_c.id, "college_name": "كلية ج", "expected": 1, "registered": 0, "tickets_confirmed": 0},
    ]

    per_event = data["per_event"]
    assert len(per_event) == 2
    assert per_event[0]["scope"] == {"event_id": event_one.id, "event_name": "حفل أ"}
    assert per_event[0]["graduates"] == {"expected": 5, "registered": 4, "not_registered": 1}
    assert per_event[1]["scope"] == {"event_id": event_two.id, "event_name": "حفل ب"}
    assert per_event[1]["graduates"] == {"expected": 1, "registered": 0, "not_registered": 1}
    assert per_event[1]["tickets"]["not_paid_yet"] == 0
    assert per_event[1]["by_college"] == [
        {"college_id": college_c.id, "college_name": "كلية ج", "expected": 1, "registered": 0, "tickets_confirmed": 0},
    ]


async def test_stats_empty_event_returns_zeros(client, make_admin, make_event):
    headers = await _admin_headers(client, make_admin)
    event = await make_event(name="حفل فارغ")

    response = await client.get(f"/api/admin/stats?event_id={event.id}", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["graduates"] == {"expected": 0, "registered": 0, "not_registered": 0}
    assert data["tickets"] == {
        "payment_submitted": 0,
        "confirmed": 0,
        "rejected": 0,
        "processing": 0,
        "awaiting_payment": 0,
        "not_paid_yet": 0,
    }
    assert data["ticket_types"] == {}
    assert data["expected_attendance"] == {"confirmed": 0, "processing": 0}
    assert data["by_college"] == []


async def test_stats_unknown_event_404(client, make_admin):
    headers = await _admin_headers(client, make_admin)
    response = await client.get("/api/admin/stats?event_id=999999", headers=headers)
    assert response.status_code == 404


async def test_stats_requires_admin(client, make_admin):
    anonymous = await client.get("/api/admin/stats")
    assert anonymous.status_code in (401, 403)

    graduate = _auth(create_access_token({"sub": "1", "graduate_id": 1, "role": "graduate", "email": "[REDACTED]", "university_id": "1"}))
    graduate_response = await client.get("/api/admin/stats", headers=graduate)
    assert graduate_response.status_code in (401, 403)

    scanner = _auth(create_access_token({"sub": "1", "scanner_id": 1, "role": "scanner", "event_id": 1}))
    scanner_response = await client.get("/api/admin/stats", headers=scanner)
    assert scanner_response.status_code in (401, 403)
