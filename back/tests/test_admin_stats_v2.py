"""Dashboard statistics v2: every number checked against hand-computed truth.

The scenario has two ceremonies that share one college and one student, accounts
that are confirmed / not confirmed / missing, tickets in every state, payments,
scans (graduate, companion, manual), volunteer answers and top students. All the
expected values below were computed by hand from that data, then the same numbers
are cross-checked against the roster endpoint (which uses the same joined rows).
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.core.redis import STATS_V2_CACHE_PREFIX, redis_client
from app.models.qr_code import QrCodeModel, QrCodeTypeEnum
from app.models.ticket import TicketStatusEnum as S
from app.models.university_record import UniversityRecordModel
from app.models.volunteer_answer import VolunteerAnswerModel
from app.services.admin_graduate_service import invalidate_admin_cache

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"
_SCAN_PW = "Scan" + "Pass" + "1234"


@pytest.fixture(autouse=True)
async def _clean_stats_cache():
    async def clear():
        keys = await redis_client.keys(f"{STATS_V2_CACHE_PREFIX}:*")
        if keys:
            await redis_client.delete(*keys)

    await clear()
    yield
    await clear()


async def _login(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login", json={"username": admin.username, _PW_FIELD: _ADMIN_PW}
    )
    assert response.status_code == 200, response.text
    return admin, {"Authorization": "Bearer " + response.json()["access_token"]}


async def _qr(db, ticket_id, kind, scanned_at=None, scanner_id=None):
    db.add(
        QrCodeModel(
            ticket_id=ticket_id,
            code_type=kind,
            is_activated=True,
            scanned_at=scanned_at,
            scanned_by_scanner_id=scanner_id,
        )
    )
    await db.commit()


@pytest.fixture
async def world(client, db, make_admin, make_event, make_college, make_university_record,
                make_graduate, make_ticket, make_payment, make_scanner):
    admin, headers = await _login(client, make_admin)
    now = datetime.now(UTC)
    e1 = await make_event(name="الحفل الأول", registration_end=now + timedelta(days=6))
    e2 = await make_event(name="الحفل الثاني", registration_end=now + timedelta(days=2))
    col_a = await make_college(e1.id, name="كلية أ")
    await make_college(e2.id, name="كلية أ")  # the same college is in both ceremonies
    col_b = await make_college(e1.id, name="كلية ب")
    col_c = await make_college(e2.id, name="كلية ج")

    async def rec(event, college, uid):
        return await make_university_record(event.id, college.id, university_id=uid, gpa=None)

    for uid in ("1001", "1002", "1003", "1004"):
        await rec(e1, col_a, uid)
    for uid in ("2001", "2002"):
        await rec(e1, col_b, uid)
    for uid in ("1001", "1005"):  # 1001 is the same student as in ceremony 1
        await rec(e2, col_a, uid)
    await rec(e2, col_c, "3001")
    for event_id, college_id, uid, rank in ((e1.id, col_a.id, "1001", 1), (e1.id, col_b.id, "2001", 2),
                                            (e2.id, col_c.id, "3001", 1)):
        await db.execute(
            update(UniversityRecordModel)
            .where(
                UniversityRecordModel.event_id == event_id,
                UniversityRecordModel.college_id == college_id,
                UniversityRecordModel.university_id == uid,
            )
            .values(top_rank_from_file=rank)
        )
    await db.commit()

    g = {}
    for key, college, uid, verified in (
        ("1001", col_a, "1001", True), ("1002", col_a, "1002", True), ("1003", col_a, "1003", False),
        ("2001", col_b, "2001", True), ("2002", col_b, "2002", True),
        ("1005", col_a, "1005", True), ("3001", col_c, "3001", True),
    ):
        g[key] = await make_graduate(college.id, university_id=uid, email_verified=verified)

    t = {}
    t["e1_1001"] = await make_ticket(g["1001"].id, e1.id, companions_count=2, status=S.CONFIRMED, price=100)
    t["e1_1002"] = await make_ticket(g["1002"].id, e1.id, companions_count=3, status=S.PROCESSING, price=150)
    t["e1_2001"] = await make_ticket(g["2001"].id, e1.id, companions_count=2, status=S.REJECTED, price=100)
    t["e1_2002"] = await make_ticket(g["2002"].id, e1.id, companions_count=2, status=S.AWAITING_PAYMENT, price=100)
    t["e2_1001"] = await make_ticket(g["1001"].id, e2.id, companions_count=3, status=S.CONFIRMED, price=150)
    t["e2_1005"] = await make_ticket(g["1005"].id, e2.id, companions_count=2, status=S.AWAITING_PAYMENT, price=100)
    t["e2_3001"] = await make_ticket(g["3001"].id, e2.id, companions_count=2, status=S.PROCESSING, price=100)

    h = timedelta(hours=1)
    await make_payment(t["e1_1001"].id, "P1", 100, submitted_at=now - 10 * h, reviewed_at=now - 8 * h)   # 2 h review
    await make_payment(t["e1_1002"].id, "P2", 150, submitted_at=now - 5 * h)                              # pending 5 h
    await make_payment(t["e1_2001"].id, "P3", 100, submitted_at=now - 12 * h, reviewed_at=now - 9 * h)   # 3 h review
    await make_payment(t["e2_1001"].id, "P4", 150, submitted_at=now - 6 * h, reviewed_at=now - 3 * h)    # 3 h review
    await make_payment(t["e2_3001"].id, "P5", 100, submitted_at=now - 2 * h)                              # pending 2 h

    scanner = await make_scanner(admin_id=admin.id, event_id=e1.id, username="scan1", pw=_SCAN_PW)
    G, C = QrCodeTypeEnum.GRADUATE, QrCodeTypeEnum.COMPANION
    await _qr(db, t["e1_1001"].id, G, scanned_at=now - h, scanner_id=scanner.id)      # scanned graduate
    await _qr(db, t["e1_1001"].id, C, scanned_at=now - h, scanner_id=scanner.id)      # scanned companion
    await _qr(db, t["e1_1001"].id, C)                                                  # companion not yet
    await _qr(db, t["e2_1001"].id, G, scanned_at=now - h, scanner_id=None)            # manual entry
    for _ in range(3):
        await _qr(db, t["e2_1001"].id, C)

    for key, wants, exp in (("1001", True, True), ("1002", True, False), ("2001", False, True), ("3001", True, True)):
        db.add(VolunteerAnswerModel(graduate_id=g[key].id, wants_responsibility=wants, has_experience=exp))
    await db.commit()
    return {"headers": headers, "e1": e1, "e2": e2, "t": t, "now": now}


async def _stats(client, headers, event_id=None):
    url = "/api/admin/stats/v2" + (f"?event_id={event_id}" if event_id else "")
    resp = await client.get(url, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _by_name(items):
    return {c["name"]: c for c in items}


async def test_event_one_every_number(client, world):
    s = await _stats(client, world["headers"], world["e1"].id)
    assert s["scope"]["event_id"] == world["e1"].id and s["scope"]["events_count"] == 1
    assert s["scope"]["event_name"] == "الحفل الأول" and s["scope"]["event_day"] is False
    assert s["registered"] == {"confirmed_accounts": 4, "unverified_accounts": 1}
    assert s["status"] == {"confirmed": 1, "processing": 1, "awaiting_payment": 1, "rejected": 1, "no_ticket": 0}
    assert sum(s["status"].values()) == s["registered"]["confirmed_accounts"]
    assert s["attendance"] == {"graduates": 1, "companions": 2, "expected": 3}
    assert s["entry"]["graduates_entered"] == 1 and s["entry"]["companions_entered"] == 1
    assert s["entry"]["entered"] == 2 and s["entry"]["manual"] == 0 and s["entry"]["expected"] == 3
    assert s["entry"]["last_entry_at"] is not None
    assert "finance" not in s
    assert s["packages"] == [{"companions_count": 2, "tickets": 1}]
    assert s["funnel"] == {"accounts": 5, "verified": 4, "paid": 3, "confirmed": 1}
    assert len(s["timeline"]) == 14 and s["timeline"][-1]["count"] == 4
    assert [r["count"] for r in s["rejections"]] == [1]
    assert s["arrivals"]["by_scanner"] == [{"name": "scan1", "count": 2}]
    assert sum(h["count"] for h in s["arrivals"]["by_hour"]) == 2
    assert s["top_students"] == {"total": 2, "registered": 2, "confirmed": 1}
    assert s["representation"] == {"answered": 3, "wants": 2, "experienced": 2, "both": 1}
    colleges = _by_name(s["colleges"])
    assert (colleges["كلية أ"]["expected"], colleges["كلية أ"]["registered"], colleges["كلية أ"]["confirmed"]) == (4, 2, 1)
    assert (colleges["كلية ب"]["expected"], colleges["كلية ب"]["registered"], colleges["كلية ب"]["confirmed"]) == (2, 2, 0)
    assert "كلية ج" not in colleges
    att = s["attention"]
    assert (att["processing"], att["rejected"], att["unverified"], att["confirmed"]) == (1, 1, 1, 1)
    assert att["oldest_pending_hours"] == pytest.approx(5.0, abs=0.2)
    assert s["footer"]["confirmed_accounts"] == 4
    assert s["footer"]["registration"]["event_name"] == "الحفل الأول"
    assert s["footer"]["reviewed_count"] == 2 and s["footer"]["avg_review_hours"] == pytest.approx(2.5, abs=0.1)
    assert len(s["by_event"]) == 1 and s["by_event"][0]["registered"] == 4


async def test_event_two_every_number(client, world):
    s = await _stats(client, world["headers"], world["e2"].id)
    assert s["registered"] == {"confirmed_accounts": 3, "unverified_accounts": 0}
    assert s["status"] == {"confirmed": 1, "processing": 1, "awaiting_payment": 1, "rejected": 0, "no_ticket": 0}
    assert s["attendance"] == {"graduates": 1, "companions": 3, "expected": 4}
    assert s["entry"]["graduates_entered"] == 1 and s["entry"]["manual"] == 1
    assert s["entry"]["companions_entered"] == 0 and s["entry"]["entered"] == 1 and s["entry"]["expected"] == 4
    assert s["packages"] == [{"companions_count": 3, "tickets": 1}]
    assert s["top_students"] == {"total": 1, "registered": 1, "confirmed": 0}
    assert s["representation"] == {"answered": 2, "wants": 2, "experienced": 2, "both": 2}
    colleges = _by_name(s["colleges"])
    assert (colleges["كلية أ"]["expected"], colleges["كلية أ"]["registered"], colleges["كلية أ"]["confirmed"]) == (2, 2, 1)
    assert (colleges["كلية ج"]["expected"], colleges["كلية ج"]["registered"], colleges["كلية ج"]["confirmed"]) == (1, 1, 0)
    assert s["attention"]["oldest_pending_hours"] == pytest.approx(2.0, abs=0.2)
    assert s["footer"]["reviewed_count"] == 1 and s["footer"]["avg_review_hours"] == pytest.approx(3.0, abs=0.1)


async def test_all_ceremonies_count_people_once_and_each_college_once(client, world):
    s = await _stats(client, world["headers"])
    assert s["scope"]["event_id"] is None and s["scope"]["events_count"] == 2
    # 7 confirmed registrations but only 6 different people (student 1001 is in both)
    assert s["registered"] == {"confirmed_accounts": 6, "unverified_accounts": 1}
    assert sum(e["registered"] for e in s["by_event"]) == 7
    assert s["status"] == {"confirmed": 2, "processing": 2, "awaiting_payment": 2, "rejected": 1, "no_ticket": 0}
    assert [e["event_name"] for e in s["by_event"]] == ["الحفل الأول", "الحفل الثاني"]
    assert s["attendance"] == {"graduates": 2, "companions": 5, "expected": 7}
    assert s["entry"]["graduates_entered"] == 2 and s["entry"]["companions_entered"] == 1
    assert s["entry"]["entered"] == 3 and s["entry"]["manual"] == 1 and s["entry"]["expected"] == 7
    assert s["packages"] == [
        {"companions_count": 2, "tickets": 1},
        {"companions_count": 3, "tickets": 1},
    ]
    assert s["top_students"] == {"total": 3, "registered": 3, "confirmed": 1}
    assert s["representation"] == {"answered": 4, "wants": 3, "experienced": 3, "both": 2}
    names = [c["name"] for c in s["colleges"]]
    assert sorted(names) == ["كلية أ", "كلية ب", "كلية ج"] and len(names) == len(set(names))  # no duplicated college
    colleges = _by_name(s["colleges"])
    assert (colleges["كلية أ"]["expected"], colleges["كلية أ"]["registered"], colleges["كلية أ"]["confirmed"]) == (5, 3, 1)
    assert (colleges["كلية ب"]["expected"], colleges["كلية ب"]["registered"], colleges["كلية ب"]["confirmed"]) == (2, 2, 0)
    assert (colleges["كلية ج"]["expected"], colleges["كلية ج"]["registered"], colleges["كلية ج"]["confirmed"]) == (1, 1, 0)
    att = s["attention"]
    assert (att["processing"], att["rejected"], att["unverified"], att["confirmed"]) == (2, 1, 1, 2)
    assert att["oldest_pending_hours"] == pytest.approx(5.0, abs=0.2)
    assert s["footer"]["confirmed_accounts"] == 6
    assert s["footer"]["registration"]["event_name"] == "الحفل الثاني"  # the nearest closing date
    assert s["footer"]["reviewed_count"] == 3 and s["footer"]["avg_review_hours"] == pytest.approx(2.7, abs=0.1)


async def _roster_total(client, headers, **params):
    resp = await client.get("/api/admin/roster", params={**params, "limit": 1}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["total"]


@pytest.mark.parametrize("scope", ["e1", "e2", None])
async def test_every_number_equals_the_roster_page(client, world, scope):
    headers = world["headers"]
    event = world[scope].id if scope else None
    s = await _stats(client, headers, event)
    base = {"event_id": event} if event else {}
    verified = {**base, "registration": "verified"}
    for state, key in (("confirmed", "confirmed"), ("processing", "processing"),
                       ("awaiting_payment", "awaiting_payment"), ("rejected", "rejected")):
        assert s["status"][key] == await _roster_total(client, headers, **verified, ticket=state), key
    assert s["status"]["no_ticket"] == await _roster_total(client, headers, **verified, ticket="none")
    assert sum(e["registered"] for e in s["by_event"]) == await _roster_total(client, headers, **verified)
    assert s["registered"]["unverified_accounts"] == await _roster_total(client, headers, **base, registration="unverified")
    assert s["entry"]["graduates_entered"] == await _roster_total(
        client, headers, **verified, ticket="confirmed", entry="entered")
    assert sum(e["expected_people"] for e in s["by_event"]) == await _roster_total(client, headers, **base)
    assert s["top_students"]["total"] <= await _roster_total(client, headers, **base, top_rank="any")
    if scope:  # inside one ceremony a person is one record, so the numbers are identical
        assert s["top_students"]["registered"] == await _roster_total(client, headers, **verified, top_rank="any")
        assert s["top_students"]["confirmed"] == await _roster_total(
            client, headers, **verified, ticket="confirmed", top_rank="any")
        assert s["registered"]["confirmed_accounts"] == await _roster_total(client, headers, **verified)
        for col in s["colleges"]:
            assert col["expected"] == await _roster_total(client, headers, **base, college_id=col["college_id"])
            assert col["registered"] == await _roster_total(
                client, headers, **verified, college_id=col["college_id"])
            assert col["confirmed"] == await _roster_total(
                client, headers, **verified, ticket="confirmed", college_id=col["college_id"])


async def test_an_admin_action_shows_immediately_and_the_result_is_cached(client, world):
    headers, t = world["headers"], world["t"]
    first = await _stats(client, headers, world["e1"].id)
    assert first["status"]["processing"] == 1
    again = await _stats(client, headers, world["e1"].id)
    assert again["generated_at"] == first["generated_at"]  # served from the cache, no new queries

    resp = await client.post(
        f"/api/admin/tickets/{t['e1_1002'].id}/reject", json={"reason": "لم يصلنا إشعار الدفع"}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    after = await _stats(client, headers, world["e1"].id)
    assert after["generated_at"] != first["generated_at"]  # the cache was cleared by the action
    assert after["status"]["processing"] == 0 and after["status"]["rejected"] == 2
    assert after["attention"]["rejected"] == 2 and after["attention"]["oldest_pending_hours"] is None


async def test_invalidation_clears_every_scope(client, world):
    headers = world["headers"]
    one = await _stats(client, headers, world["e1"].id)
    every = await _stats(client, headers)
    await invalidate_admin_cache()
    assert (await _stats(client, headers, world["e1"].id))["generated_at"] != one["generated_at"]
    assert (await _stats(client, headers))["generated_at"] != every["generated_at"]


async def test_an_unknown_ceremony_is_404_and_a_token_is_required(client, world):
    resp = await client.get("/api/admin/stats/v2?event_id=999999", headers=world["headers"])
    assert resp.status_code == 404
    assert (await client.get("/api/admin/stats/v2")).status_code in (401, 403)


async def test_an_empty_system_returns_zeros_not_errors(client, make_admin):
    _, headers = await _login(client, make_admin)
    s = await _stats(client, headers)
    assert s["registered"] == {"confirmed_accounts": 0, "unverified_accounts": 0}
    assert s["status"] == {"confirmed": 0, "processing": 0, "awaiting_payment": 0, "rejected": 0, "no_ticket": 0}
    assert s["attendance"]["expected"] == 0 and s["entry"]["entered"] == 0
    assert s["colleges"] == [] and s["by_event"] == []
    assert s["packages"] == [] and s["rejections"] == []
    assert s["funnel"] == {"accounts": 0, "verified": 0, "paid": 0, "confirmed": 0}
    assert len(s["timeline"]) == 14 and sum(d["count"] for d in s["timeline"]) == 0
    assert s["arrivals"] == {"by_hour": [], "by_scanner": []}
    assert s["footer"]["avg_review_hours"] is None and s["footer"]["registration"] is None


# --- the front end is tested against REAL answers of this API -----------------------
import json
import os
from pathlib import Path

_FIXTURES = Path(__file__).resolve().parents[2] / "front" / "tests" / "fixtures"


def _keys(value):
    """The nested key structure of an answer, ignoring the values."""
    if isinstance(value, dict):
        return {k: _keys(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [_keys(value[0])] if value else []
    return None


async def test_dump_answers_for_the_front_end_tests(client, world):
    """Run with STATS_V2_DUMP=1 to refresh front/tests/fixtures (the shape test below keeps them honest)."""
    if os.getenv("STATS_V2_DUMP") != "1":
        pytest.skip("only used to regenerate the front-end fixtures")
    _FIXTURES.mkdir(parents=True, exist_ok=True)
    for name, event_id in (("stats-v2-event.json", world["e1"].id), ("stats-v2-all.json", None)):
        data = await _stats(client, world["headers"], event_id)
        (_FIXTURES / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


@pytest.mark.skipif(not _FIXTURES.exists(), reason="the front end is not next to the backend")
@pytest.mark.parametrize("name,scope", [("stats-v2-event.json", "e1"), ("stats-v2-all.json", None)])
async def test_the_answer_has_exactly_the_shape_the_front_end_is_tested_with(client, world, name, scope):
    live = await _stats(client, world["headers"], world[scope].id if scope else None)
    saved = json.loads((_FIXTURES / name).read_text(encoding="utf-8"))
    assert _keys(live) == _keys(saved)
