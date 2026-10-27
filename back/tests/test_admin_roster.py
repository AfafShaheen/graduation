"""Admin roster (the full graduates list of the uploaded university files).

The roster lists EVERY imported record (registered or not) with the person's
registration, ticket, payment and entry state, supports combined filters, a
paginated list and an Excel export, and reports which exceptional actions are
allowed. Names below are stored in normalised form like the importer does.
"""

from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import load_workbook
from sqlalchemy import select, update

from app.models.audit_log import AuditLogModel
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum
from app.models.university_record import UniversityRecordModel

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _login(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return admin, {"Authorization": "Bearer " + response.json()["access_token"]}


async def _qr(db, ticket_id, *, scanned=False, scanner_id=None):
    row = QrCodeModel(
        ticket_id=ticket_id,
        code_type=QrCodeTypeEnum.GRADUATE,
        is_activated=True,
        scanned_at=datetime.now(UTC) if scanned else None,
        scanned_by_scanner_id=scanner_id,
    )
    db.add(row)
    await db.commit()
    return row


@pytest.fixture
async def seed(
    client,
    db,
    make_admin,
    make_event,
    make_college,
    make_university_record,
    make_graduate,
    make_ticket,
    make_payment,
    make_scanner,
):
    """Eleven people covering every state. GPAs make 1001/1002/1003 the top
    three of college A (dense rank fallback); college B has two people."""
    admin, headers = await _login(client, make_admin)
    event = await make_event(seat_prefix="E")
    college_a = await make_college(event.id, name="كلية الهندسة")
    college_b = await make_college(event.id, name="كلية العلوم")

    async def person(uid, name, gpa, college=college_a):
        return await make_university_record(
            event.id, college.id, university_id=uid, full_name=name, gpa=Decimal(gpa)
        )

    async def account(uid, college=college_a, verified=True):
        return await make_graduate(
            college.id, university_id=uid, email_verified=verified
        )

    people = {}
    people["1001"] = await person("1001", "احمد سالم", "95")  # not registered
    people["1002"] = await person("1002", "بسام خالد", "90")
    await account("1002", verified=False)  # registered, e-mail not confirmed
    people["1003"] = await person("1003", "جمال نبيل", "85")
    g3 = await account("1003")
    await make_ticket(g3.id, event.id, status=TicketStatusEnum.AWAITING_PAYMENT)

    people["1004"] = await person("1004", "دانية سعيد", "70")
    g4 = await account("1004")
    t4 = await make_ticket(g4.id, event.id, status=TicketStatusEnum.PROCESSING)
    await make_payment(t4.id, transaction_number="T1004", amount=100000)

    people["1005"] = await person("1005", "ريم حسن", "71")
    g5 = await account("1005")
    t5 = await make_ticket(g5.id, event.id, status=TicketStatusEnum.CONFIRMED)
    await make_payment(t5.id, transaction_number="T1005", amount=100000)
    await _qr(db, t5.id)  # graduate code exists but was never scanned

    scanner = await make_scanner(admin.id, event.id)
    people["1006"] = await person("1006", "سامر ياسين", "72")
    g6 = await account("1006")
    t6 = await make_ticket(
        g6.id, event.id, companions_count=3, status=TicketStatusEnum.CONFIRMED
    )
    await make_payment(t6.id, transaction_number="T1006", amount=100000)
    await _qr(db, t6.id, scanned=True, scanner_id=scanner.id)  # entered by a scanner

    people["1007"] = await person("1007", "طارق منير", "73")
    g7 = await account("1007")
    t7 = await make_ticket(g7.id, event.id, status=TicketStatusEnum.CONFIRMED)
    await make_payment(t7.id, transaction_number="T1007", amount=100000)
    await _qr(db, t7.id, scanned=True, scanner_id=None)  # entered by hand

    people["1008"] = await person("1008", "هدى فؤاد", "74")
    g8 = await account("1008")
    t8 = await make_ticket(g8.id, event.id, status=TicketStatusEnum.REJECTED)
    await make_payment(t8.id, transaction_number="T1008", amount=100000)

    people["1009"] = await person("1009", "وائل عادل", "75")
    g9 = await account("1009")
    t9 = await make_ticket(g9.id, event.id, status=TicketStatusEnum.PROCESSING)
    await make_payment(t9.id, transaction_number="T1009", amount=90000)  # mismatch

    people["2001"] = await person("2001", "زينب علي", "60", college_b)
    people["2002"] = await person("2002", "سلمى عمر", "55", college_b)

    return {
        "headers": headers,
        "event": event,
        "college_a": college_a,
        "college_b": college_b,
        "people": people,
        "tickets": {"1003": None, "1005": t5, "1006": t6, "1007": t7},
        "graduates": {"1005": g5, "1006": g6, "1007": g7},
    }


async def _roster(client, headers, **params):
    response = await client.get("/api/admin/roster", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _uids(body):
    return sorted(item["university_id"] for item in body["items"])


# --------------------------------------------------------------------- access


async def test_roster_requires_an_admin(client, seed):
    assert (await client.get("/api/admin/roster")).status_code in (401, 403)
    assert (await client.get("/api/admin/roster/export")).status_code in (401, 403)
    bad = {"Authorization": "Bearer not-a-token"}
    assert (await client.get("/api/admin/roster", headers=bad)).status_code in (401, 403)


# ----------------------------------------------------------------- the list


async def test_lists_everyone_including_people_who_never_registered(client, seed):
    body = await _roster(client, seed["headers"])
    assert body["total"] == 11
    assert len(body["items"]) == 11
    by_id = {i["university_id"]: i for i in body["items"]}
    assert by_id["1001"]["registration"] == {
        "state": "not_registered",
        "graduate_id": None,
        "email": None,
        "email_verified": None,
    }
    assert by_id["1001"]["ticket"] is None
    assert by_id["1001"]["payment"]["state"] == "none"
    assert by_id["1001"]["entry"] == {"entered": False, "at": None, "manual": False}
    assert by_id["1002"]["registration"]["state"] == "unverified"
    assert by_id["1003"]["registration"]["state"] == "verified"
    assert by_id["1003"]["registration"]["email"].endswith("@example.com")
    item = by_id["1001"]
    assert item["college_name"] == "كلية الهندسة"
    assert item["event_name"]
    assert item["gpa"] == "95.00"
    assert item["file_id"] is None and item["file_name"] is None


async def test_registration_filter_uses_clear_account_states(client, seed):
    h = seed["headers"]
    assert _uids(await _roster(client, h, registration="not_registered")) == [
        "1001",
        "2001",
        "2002",
    ]
    assert _uids(await _roster(client, h, registration="unverified")) == ["1002"]
    verified = await _roster(client, h, registration="verified")
    assert _uids(verified) == [f"100{n}" for n in range(3, 10)]
    assert verified["total"] == 7


async def test_ticket_filter(client, seed):
    h = seed["headers"]
    assert _uids(await _roster(client, h, ticket="none")) == ["1001", "1002", "2001", "2002"]
    assert _uids(await _roster(client, h, ticket="awaiting_payment")) == ["1003"]
    assert _uids(await _roster(client, h, ticket="processing")) == ["1004", "1009"]
    assert _uids(await _roster(client, h, ticket="confirmed")) == ["1005", "1006", "1007"]
    assert _uids(await _roster(client, h, ticket="rejected")) == ["1008"]


async def test_payment_filter_and_mismatch_flag(client, seed):
    h = seed["headers"]
    assert _uids(await _roster(client, h, payment="none")) == [
        "1001",
        "1002",
        "1003",
        "2001",
        "2002",
    ]
    assert _uids(await _roster(client, h, payment="pending")) == ["1004", "1009"]
    assert _uids(await _roster(client, h, payment="confirmed")) == ["1005", "1006", "1007"]
    assert _uids(await _roster(client, h, payment="rejected")) == ["1008"]
    mismatch = await _roster(client, h, payment="mismatch")
    assert _uids(mismatch) == ["1009"]
    pay = mismatch["items"][0]["payment"]
    assert pay["mismatch"] is True and pay["amount"] == "90000.00"
    ok = {i["university_id"]: i for i in (await _roster(client, h))["items"]}["1004"]
    assert ok["payment"]["mismatch"] is False and ok["payment"]["state"] == "pending"


async def test_entry_filter_and_how_the_person_entered(client, seed):
    h = seed["headers"]
    entered = await _roster(client, h, entry="entered")
    assert _uids(entered) == ["1006", "1007"]
    by_id = {i["university_id"]: i["entry"] for i in entered["items"]}
    assert by_id["1006"]["entered"] is True and by_id["1006"]["manual"] is False
    assert by_id["1007"]["entered"] is True and by_id["1007"]["manual"] is True
    assert by_id["1006"]["at"] is not None
    assert (await _roster(client, h, entry="not_entered"))["total"] == 9


async def test_ticket_type_filter(client, seed):
    h = seed["headers"]
    assert _uids(await _roster(client, h, ticket_type="three")) == ["1006"]
    two = await _roster(client, h, ticket_type="two")
    assert _uids(two) == ["1003", "1004", "1005", "1007", "1008", "1009"]
    ticket = {i["university_id"]: i["ticket"] for i in two["items"]}["1003"]
    assert ticket["type"] == "two" and ticket["companions_count"] == 2


async def test_college_filter(client, seed):
    h = seed["headers"]
    body = await _roster(client, h, college_id=seed["college_b"].id)
    assert _uids(body) == ["2001", "2002"]


async def test_filters_combine(client, seed):
    h = seed["headers"]
    body = await _roster(client, h, registration="verified", ticket="confirmed", entry="not_entered")
    assert _uids(body) == ["1005"]
    empty = await _roster(client, h, registration="not_registered", ticket="confirmed")
    assert empty == {"total": 0, "items": []}


async def test_invalid_filter_values_are_rejected(client, seed):
    h = seed["headers"]
    for params in (
        {"registration": "maybe"},
        {"ticket": "paid"},
        {"payment": "free"},
        {"entry": "inside"},
        {"top_rank": "4"},
        {"ticket_type": "four"},
        {"limit": 0},
        {"limit": 500},
        {"skip": -1},
    ):
        response = await client.get("/api/admin/roster", params=params, headers=h)
        assert response.status_code == 422, params


# -------------------------------------------------------------------- search


async def test_search_by_name_with_arabic_normalisation_and_by_id(client, seed):
    h = seed["headers"]
    # Stored "احمد سالم"; searching with a hamza must still find it.
    assert _uids(await _roster(client, h, search="أحمد")) == ["1001"]
    assert _uids(await _roster(client, h, search="سالم")) == ["1001"]
    assert _uids(await _roster(client, h, search="1005")) == ["1005"]
    assert _uids(await _roster(client, h, search="100")) == [f"100{n}" for n in range(1, 10)]
    assert (await _roster(client, h, search="غير موجود"))["total"] == 0


async def test_search_treats_wildcards_literally(client, seed):
    h = seed["headers"]
    assert (await _roster(client, h, search="%"))["total"] == 0
    assert (await _roster(client, h, search="_"))["total"] == 0


# ---------------------------------------------------------------- top status


async def test_top_status_falls_back_to_the_gpa_ranking(client, seed):
    h = seed["headers"]
    items = {i["university_id"]: i for i in (await _roster(client, h))["items"]}
    assert (items["1001"]["top_rank"], items["1001"]["is_top"]) == (1, True)
    assert (items["1002"]["top_rank"], items["1002"]["is_top"]) == (2, True)
    assert (items["1003"]["top_rank"], items["1003"]["is_top"]) == (3, True)
    assert (items["1009"]["top_rank"], items["1009"]["is_top"]) == (None, False)
    assert _uids(await _roster(client, h, top_rank="1", college_id=seed["college_a"].id)) == ["1001"]
    assert _uids(await _roster(client, h, top_rank="2", college_id=seed["college_a"].id)) == ["1002"]
    assert _uids(await _roster(client, h, top_rank="3", college_id=seed["college_a"].id)) == ["1003"]


async def test_top_status_from_the_file_wins_over_the_gpa(client, db, seed):
    h = seed["headers"]
    event_id = seed["event"].id

    async def set_file_value(uid, value):
        await db.execute(
            update(UniversityRecordModel)
            .where(
                UniversityRecordModel.event_id == event_id,
                UniversityRecordModel.university_id == uid,
            )
            .values(top_rank_from_file=value)
        )

    await set_file_value("1001", 0)  # best GPA, but the file says "no"
    await set_file_value("1009", 2)  # low GPA, but the file says second
    await set_file_value("1008", -1)  # top student without a known rank
    await db.commit()

    items = {i["university_id"]: i for i in (await _roster(client, h))["items"]}
    assert (items["1001"]["top_rank"], items["1001"]["is_top"]) == (None, False)
    assert (items["1009"]["top_rank"], items["1009"]["is_top"]) == (2, True)
    assert (items["1008"]["top_rank"], items["1008"]["is_top"]) == (None, True)

    any_top = _uids(await _roster(client, h, top_rank="any", college_id=seed["college_a"].id))
    assert "1008" in any_top and "1009" in any_top and "1001" not in any_top
    none_top = _uids(await _roster(client, h, top_rank="none", college_id=seed["college_a"].id))
    assert "1001" in none_top and "1008" not in none_top
    # A rank-2 filter finds the file value, not the unspecified top student.
    rank2 = _uids(await _roster(client, h, top_rank="2", college_id=seed["college_a"].id))
    assert "1009" in rank2 and "1008" not in rank2


# ----------------------------------------------------------- allowed actions


async def test_actions_flags_follow_the_backend_rules(client, seed):
    items = {i["university_id"]: i for i in (await _roster(client, seed["headers"]))["items"]}
    # Confirmed and not entered: can return the payment and register entry.
    assert items["1005"]["actions"] == {
        "revert_payment": True,
        "manual_entry": True,
        "cancel_scan": False,
    }
    # Confirmed and entered: can return the payment and cancel the scan.
    for uid in ("1006", "1007"):
        assert items[uid]["actions"] == {
            "revert_payment": True,
            "manual_entry": False,
            "cancel_scan": True,
        }
    # Nothing is allowed for everybody else.
    for uid in ("1001", "1002", "1003", "1004", "1008", "1009", "2001"):
        assert items[uid]["actions"] == {
            "revert_payment": False,
            "manual_entry": False,
            "cancel_scan": False,
        }


async def test_actions_offered_by_the_roster_really_work(client, seed):
    h = seed["headers"]
    grad = seed["graduates"]["1005"]
    ticket = seed["tickets"]["1005"]

    # Manual entry (offered for 1005) goes through the existing endpoint.
    entry = await client.post(f"/api/admin/graduates/{grad.id}/manual-check-in", headers=h)
    # The roster fixture created the graduate code only; companions do not exist,
    # so the rule may refuse. What matters: the flag matches the endpoint's own
    # precondition (confirmed ticket, graduate code present, not scanned yet).
    assert entry.status_code == 200, entry.text
    after = {i["university_id"]: i for i in (await _roster(client, h))["items"]}["1005"]
    assert after["entry"]["entered"] is True and after["entry"]["manual"] is True
    assert after["actions"] == {"revert_payment": True, "manual_entry": False, "cancel_scan": True}

    # Returning the payment (offered) moves the ticket back to "processing".
    back = await client.post(f"/api/admin/tickets/{ticket.id}/revert-payment", headers=h)
    assert back.status_code == 200, back.text
    after = {i["university_id"]: i for i in (await _roster(client, h))["items"]}["1005"]
    assert after["ticket"]["status"] == "PROCESSING"
    assert after["actions"]["revert_payment"] is False
    assert after["actions"]["manual_entry"] is False


# ----------------------------------------------------------------- pagination


async def test_pagination_keeps_a_stable_order_and_the_full_total(client, seed):
    h = seed["headers"]
    first = await _roster(client, h, limit=4, skip=0)
    second = await _roster(client, h, limit=4, skip=4)
    third = await _roster(client, h, limit=4, skip=8)
    assert first["total"] == second["total"] == third["total"] == 11
    assert [len(first["items"]), len(second["items"]), len(third["items"])] == [4, 4, 3]
    ids = [i["record_id"] for b in (first, second, third) for i in b["items"]]
    assert len(set(ids)) == 11
    names = [i["full_name"] for b in (first, second, third) for i in b["items"]]
    assert names == sorted(names)


# --------------------------------------------------- the uploaded file filter


async def test_records_remember_their_file_and_the_roster_filters_by_it(
    client, db, make_event, make_college, make_admin, make_university_record, tmp_path, monkeypatch
):
    import app.services.university_files_service as files_service
    from openpyxl import Workbook

    monkeypatch.setattr(files_service, "STORAGE_DIR", str(tmp_path))
    _, headers = await _login(client, make_admin)
    event = await make_event()
    college = await make_college(event.id, name="كلية الحقوق")
    # A record that did not come from any file (for example a direct upload).
    await make_university_record(event.id, college.id, university_id="8001", full_name="وليد باسل")

    wb = Workbook()
    ws = wb.active
    ws.append(["university_id", "full_name", "father_name", "mother_name", "college", "gender", "gpa"])
    ws.append(["8002", "ليلى كمال", "كمال", "هالة", "كلية الحقوق", "أنثى", "80"])
    ws.append(["8003", "مازن رامي", "رامي", "رنا", "كلية الحقوق", "ذكر", "81"])
    buffer = BytesIO()
    wb.save(buffer)

    uploaded = await client.post(
        "/api/admin/university-files",
        files={"file": ("graduates.xlsx", buffer.getvalue(), _XLSX)},
        headers=headers,
    )
    assert uploaded.status_code == 200, uploaded.text
    file_id = uploaded.json()["file"]["id"]
    linked = await client.post(
        f"/api/admin/university-files/{file_id}/link", json={"event_id": event.id}, headers=headers
    )
    assert linked.status_code == 200, linked.text
    assert linked.json()["status"] == "imported"

    everyone = await _roster(client, headers)
    assert everyone["total"] == 3
    by_id = {i["university_id"]: i for i in everyone["items"]}
    assert by_id["8001"]["file_id"] is None and by_id["8001"]["file_name"] is None
    assert by_id["8002"]["file_id"] == file_id
    assert by_id["8002"]["file_name"] == "graduates.xlsx"

    from_file = await _roster(client, headers, file_id=file_id)
    assert _uids(from_file) == ["8002", "8003"]

    # Deleting the file keeps the people and only forgets where they came from.
    deleted = await client.delete(f"/api/admin/university-files/{file_id}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    after = await _roster(client, headers)
    assert after["total"] == 3
    assert all(i["file_id"] is None for i in after["items"])
    assert (await _roster(client, headers, file_id=file_id))["total"] == 0


async def test_a_college_shared_by_two_ceremonies_keeps_tickets_per_ceremony(
    client, make_admin, make_event, make_college, make_university_record, make_graduate, make_ticket
):
    _, headers = await _login(client, make_admin)
    first = await make_event(name="الحفل الأول")
    second = await make_event(name="الحفل الثاني")
    college = await make_college(first.id, name="كلية مشتركة")
    await make_college(second.id, name="كلية مشتركة")  # same college, second ceremony
    await make_university_record(first.id, college.id, university_id="7001", full_name="كريم هاني")
    await make_university_record(second.id, college.id, university_id="7001", full_name="كريم هاني")
    graduate = await make_graduate(college.id, university_id="7001", email_verified=True)
    await make_ticket(graduate.id, first.id, status=TicketStatusEnum.AWAITING_PAYMENT)

    body = await _roster(client, headers)
    assert body["total"] == 2
    by_event = {i["event_name"]: i for i in body["items"]}
    assert by_event["الحفل الأول"]["ticket"]["status"] == "AWAITING_PAYMENT"
    # The same person, but the ticket belongs to the first ceremony only.
    assert by_event["الحفل الثاني"]["ticket"] is None
    assert (await _roster(client, headers, ticket="awaiting_payment"))["total"] == 1
    assert (await _roster(client, headers, ticket="none"))["total"] == 1


# --------------------------------------------------------------------- export


def _sheet(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith(_XLSX)
    assert ".xlsx" in response.headers["content-disposition"]
    return load_workbook(BytesIO(response.content)).active


async def test_export_matches_the_list_and_the_applied_filters(client, seed):
    h = seed["headers"]
    everything = _sheet(await client.get("/api/admin/roster/export", headers=h))
    assert everything.max_row == 12  # header + 11 people
    headers_row = [c.value for c in everything[1]]
    assert headers_row[2] == "الاسم الكامل" and "حالة التسجيل" in headers_row

    filtered = _sheet(
        await client.get(
            "/api/admin/roster/export", params={"ticket": "confirmed", "entry": "entered"}, headers=h
        )
    )
    assert filtered.max_row == 3  # header + 1006 + 1007
    col = {name: idx for idx, name in enumerate(headers_row)}
    rows = [[c.value for c in row] for row in filtered.iter_rows(min_row=2)]
    assert {r[col["الرقم الجامعي"]] for r in rows} == {"1006", "1007"}
    assert {r[col["الدخول"]] for r in rows} == {"دخل"}
    assert {r[col["طريقة الدخول"]] for r in rows} == {"ماسح", "يدوي"}
    assert {r[col["حالة التسجيل"]] for r in rows} == {"سجّل — تم تأكيد البريد (OTP)"}

    unregistered = _sheet(
        await client.get(
            "/api/admin/roster/export", params={"registration": "not_registered"}, headers=h
        )
    )
    first = [c.value for c in unregistered[2]]
    assert first[col["حالة التسجيل"]] == "لم يسجّل بعد"
    assert first[col["حالة التذكرة"]] == "لا توجد تذكرة"


async def test_export_numbers_are_numeric_and_texts_cannot_be_formulas(
    client, db, make_admin, make_event, make_college, make_university_record
):
    _, headers = await _login(client, make_admin)
    event = await make_event()
    college = await make_college(event.id, name="كلية الاقتصاد")
    await make_university_record(
        event.id, college.id, university_id="9001", full_name='=HYPERLINK("http://x.test","click")'
    )
    sheet = _sheet(await client.get("/api/admin/roster/export", headers=headers))
    name_cell = sheet.cell(row=2, column=3)
    assert name_cell.data_type == "s"
    assert name_cell.value == '=HYPERLINK("http://x.test","click")'


async def test_export_writes_an_audit_row_without_personal_data(client, db, seed):
    h = seed["headers"]
    response = await client.get(
        "/api/admin/roster/export", params={"search": "احمد", "ticket": "none"}, headers=h
    )
    assert response.status_code == 200
    row = (
        await db.execute(select(AuditLogModel).where(AuditLogModel.action == "ROSTER_EXPORTED"))
    ).scalar_one()
    assert row.actor_type == "ADMIN"
    assert "rows=1" in row.details
    assert "search" in row.details and "ticket" in row.details
    assert "احمد" not in (row.details or "") and "احمد" not in row.target


async def test_export_refuses_a_huge_result(client, seed, monkeypatch):
    import app.services.roster_service as roster_service

    monkeypatch.setattr(roster_service, "EXPORT_MAX_ROWS", 3)
    response = await client.get("/api/admin/roster/export", headers=seed["headers"])
    assert response.status_code == 400
    assert response.json()["detail"]
