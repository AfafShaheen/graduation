"""Comprehensive academic tests for Step 1 verification, GPA, Major, and Top-3 Rank (Section 4 & 8)."""

import pytest
from decimal import Decimal
from app.core import messages
from app.services.graduate_service import create_registration_token, register_step2_service
from app.schemas.graduate import RegisterStep2Request


async def test_academic_correct_data_returns_200(client, make_event, make_college, make_major, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    major = await make_major(college.id, name="هندسة برمجيات")
    await make_university_record(
        event.id, college.id, university_id="100001", full_name="محمد أحمد",
        father_name="أحمد", mother_name="سعاد", gender="male",
        gpa=Decimal("90.00"), major_id=major.id
    )

    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college.id,
            "university_id": "100001",
            "full_name": "محمد أحمد",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "male",
            "major_id": major.id,
            "gpa": "90.00",
            "top_rank": 1,
        }
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is True


async def test_academic_wrong_gpa_returns_generic_fail(client, make_event, make_college, make_major, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    major = await make_major(college.id)
    await make_university_record(
        event.id, college.id, university_id="100002", full_name="محمد علي",
        father_name="أحمد", mother_name="سعاد", gender="male",
        gpa=Decimal("85.00"), major_id=major.id
    )

    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college.id,
            "university_id": "100002",
            "full_name": "محمد علي",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "male",
            "major_id": major.id,
            "gpa": "80.00", # Wrong GPA
            "top_rank": 1,
        }
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == messages.GENERIC_VERIFY_FAIL


async def test_academic_gpa_formatting_equivalence(client, make_event, make_college, make_major, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    major = await make_major(college.id)
    await make_university_record(
        event.id, college.id, university_id="100003", full_name="سارة أحمد",
        father_name="أحمد", mother_name="سعاد", gender="female",
        gpa=Decimal("85.50"), major_id=major.id
    )

    # Sending 85.5 should match 85.50
    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college.id,
            "university_id": "100003",
            "full_name": "سارة أحمد",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "female",
            "major_id": major.id,
            "gpa": "85.5",
            "top_rank": 1,
        }
    )
    assert resp.status_code == 200


@pytest.mark.parametrize("invalid_gpa", ["-1.00", "100.01", "85.555"])
async def test_academic_invalid_gpa_validation_422(client, make_event, make_college, invalid_gpa):
    event = await make_event()
    college = await make_college(event.id)
    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college.id,
            "university_id": "100004",
            "full_name": "خالد أحمد",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "male",
            "gpa": invalid_gpa,
            "top_rank": 1,
        }
    )
    assert resp.status_code == 422


async def test_academic_major_from_other_college_rejected(client, make_event, make_college, make_major, make_university_record):
    event = await make_event()
    college1 = await make_college(event.id, name="كلية 1")
    college2 = await make_college(event.id, name="كلية 2")
    major2 = await make_major(college2.id, name="تخصص كلية 2")
    await make_university_record(
        event.id, college1.id, university_id="100005", full_name="عمر أحمد",
        father_name="أحمد", mother_name="سعاد", gender="male",
        gpa=Decimal("80.00"), major_id=None
    )

    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college1.id,
            "university_id": "100005",
            "full_name": "عمر أحمد",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "male",
            "major_id": major2.id, # belongs to college2
            "gpa": "80.00",
            "top_rank": 1,
        }
    )
    assert resp.status_code == 400


async def test_academic_major_mismatch_rejected(client, make_event, make_college, make_major, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    major1 = await make_major(college.id, name="تخصص 1")
    major2 = await make_major(college.id, name="تخصص 2")
    await make_university_record(
        event.id, college.id, university_id="100006", full_name="زيد أحمد",
        father_name="أحمد", mother_name="سعاد", gender="male",
        gpa=Decimal("80.00"), major_id=major1.id
    )

    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college.id,
            "university_id": "100006",
            "full_name": "زيد أحمد",
            "father_name": "أحمد",
            "mother_name": "سعاد",
            "gender": "male",
            "major_id": major2.id, # record has major1
            "gpa": "80.00",
            "top_rank": 1,
        }
    )
    assert resp.status_code == 400


async def test_dense_ranking_and_top_ranks(client, make_event, make_college, make_major, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    major = await make_major(college.id)

    # GPAs: 95 (rank 1), 92 (rank 2), 92 (rank 2), 88 (rank 3), 80 (rank None / >3)
    uids = ["R1", "R2a", "R2b", "R3", "R4"]
    gpas = ["95.00", "92.00", "92.00", "88.00", "80.00"]
    expected_ranks = [1, 2, 2, 3, None]

    for uid, gpa in zip(uids, gpas):
        await make_university_record(
            event.id, college.id, university_id=uid, full_name="طالب أحمد",
            father_name="أحمد", mother_name="سعاد", gender="male",
            gpa=Decimal(gpa), major_id=major.id
        )

    for uid, exp_rank in zip(uids, expected_ranks):
        if exp_rank is None:
            resp = await client.post(
                "/api/graduates/verify-step1",
                json={
                    "college_id": college.id,
                    "university_id": uid,
                    "full_name": "طالب أحمد",
                    "father_name": "أحمد",
                    "mother_name": "سعاد",
                    "gender": "male",
                    "major_id": major.id,
                    "gpa": gpas[uids.index(uid)],
                    "top_rank": None,
                }
            )
            assert resp.status_code == 200
        else:
            resp = await client.post(
                "/api/graduates/verify-step1",
                json={
                    "college_id": college.id,
                    "university_id": uid,
                    "full_name": "طالب أحمد",
                    "father_name": "أحمد",
                    "mother_name": "سعاد",
                    "gender": "male",
                    "major_id": major.id,
                    "gpa": gpas[uids.index(uid)],
                    "top_rank": exp_rank,
                }
            )
            assert resp.status_code == 200


async def test_step2_saves_academic_fields(db, make_event, make_college, make_major, make_university_record):
    event = await make_event()
    college = await make_college(event.id)
    major = await make_major(college.id)
    rec = await make_university_record(
        event.id, college.id, university_id="200001", full_name="خالد أحمد",
        father_name="أحمد", mother_name="سعاد", gender="male",
        gpa=Decimal("95.50"), major_id=major.id
    )

    token = create_registration_token({
        "university_id": rec.university_id,
        "college_id": rec.college_id,
        "full_name": rec.full_name,
        "gender": rec.gender,
        "father_name": rec.father_name,
        "mother_name": rec.mother_name,
        "major_id": rec.major_id,
        "gpa": str(rec.gpa),
        "top_rank": 1,
    })

    req = RegisterStep2Request(
        registration_token=token,
        email="khaled@example.com",
        phone="+963911111111",
        password="Password123!"
    )
    res = await register_step2_service(db, req)
    grad_id = res["graduate_id"]

    from app.models.graduate import GraduateModel
    grad = await db.get(GraduateModel, grad_id)
    assert grad.major_id == major.id
    assert grad.gpa == Decimal("95.50")
    assert grad.top_rank == 1
