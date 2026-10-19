"""PART A: the fixed Affairs (شؤون الطلبة) file format and the top-student rules.

The Affairs office ships one fixed layout:

    الاسم، الكنية، اسم الأب، اسم الأم، الجنس، الكلية، التخصص، الرقم الجامعي،
    حالة الطالب من الأوائل، المعدل، رقم التواصل

This module exercises the importer (header model + normalisers + persistence)
and the Step-1 verification rules for it (D1-D12).
"""

from io import BytesIO

from decimal import Decimal
from openpyxl import Workbook
from sqlalchemy import select
import pytest

from app.core import messages
from app.services.university_records_service import normalize_phone, parse_gpa
from app.models.university_record import UniversityRecordModel

_AFFAIRS_HEADERS = [
    "الاسم",
    "الكنية",
    "اسم الأب",
    "اسم الأم",
    "الجنس",
    "الكلية",
    "التخصص",
    "الرقم الجامعي",
    "حالة الطالب من الأوائل",
    "المعدل",
    "رقم التواصل",
]

_LEGACY_HEADERS = [
    "university_id",
    "full_name",
    "father_name",
    "mother_name",
    "college",
    "gender",
    "gpa",
]

_COLLEGE = "كلية العلوم"
_MAJOR = "فيزياء"
_PHONE_RAW = "٠٩١٢٣٤٥٦٧٨"


def _xlsx(headers, rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(list(headers))
    for row in rows:
        sheet.append(list(row))
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def _admin_token(client, make_admin):
    admin = await make_admin()
    resp = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, "password": "AdminPass123!"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def _upload(client, token, event_id, headers, rows):
    content = _xlsx(headers, rows)
    return await client.post(
        f"/api/admin/events/{event_id}/university-records",
        files={
            "file": (
                "affairs.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers={"Authorization": f"Bearer {token}"},
    )


async def _get_record(db, university_id):
    result = await db.execute(
        select(UniversityRecordModel).where(
            UniversityRecordModel.university_id == university_id
        )
    )
    return result.scalar_one()


def _verify_payload(college_id, university_id, **overrides):
    payload = {
        "college_id": college_id,
        "university_id": university_id,
        "full_name": "محمد أحمد",
        "father_name": "خالد",
        "mother_name": "سعاد",
        "gender": "ذكر",
        "top_rank": None,
    }
    payload.update(overrides)
    return payload


# --------------------------------------------------------------------------- #
# Importer: the fixed Affairs format
# --------------------------------------------------------------------------- #
async def test_fixed_affairs_format_is_imported(
    client, db, make_event, make_college, make_major, make_admin
):
    event = await make_event()
    college = await make_college(event.id, name=_COLLEGE)
    await make_major(college.id, name=_MAJOR)
    token = await _admin_token(client, make_admin)

    resp = await _upload(
        client,
        token,
        event.id,
        _AFFAIRS_HEADERS,
        [
            (
                "محمد",
                "أحمد",
                "خالد",
                "سعاد",
                "ذكر",
                _COLLEGE,
                _MAJOR,
                "400001",
                "الثاني",
                "85.50",
                _PHONE_RAW,
            )
        ],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["errors"] == []
    assert body["added"] == 1
    assert body["summary"] == {
        "total": 1,
        "added": 1,
        "updated": 0,
        "skipped": 0,
        "error_count": 0,
    }

    record = await _get_record(db, "400001")
    assert record.first_name == "محمد"
    assert record.last_name == "احمد"
    assert record.full_name == "محمد احمد"
    assert record.top_rank_from_file == 2
    assert record.phone == normalize_phone(_PHONE_RAW)
    assert record.gpa == Decimal("85.50")
    assert record.gender == "ذكر"


async def test_legacy_full_name_column_still_imports(
    client, db, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name=_COLLEGE)
    token = await _admin_token(client, make_admin)

    resp = await _upload(
        client,
        token,
        event.id,
        _LEGACY_HEADERS,
        [("400002", "محمد أحمد", "خالد", "سعاد", _COLLEGE, "ذكر", "80.00")],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["added"] == 1

    record = await _get_record(db, "400002")
    assert record.first_name is None
    assert record.last_name is None
    assert record.full_name == "محمد احمد"
    assert record.top_rank_from_file is None


async def test_missing_names_column_reports_error(
    client, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name=_COLLEGE)
    token = await _admin_token(client, make_admin)

    # No الاسم/الكنية and no legacy الاسم الكامل.
    resp = await _upload(
        client,
        token,
        event.id,
        ["اسم الأب", "اسم الأم", "الكلية", "الجنس", "المعدل"],
        [("خالد", "سعاد", _COLLEGE, "ذكر", "80.00")],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["added"] == 0
    assert any("الاسم" in err for err in body["errors"])
    assert body["summary"]["error_count"] == len(body["errors"])


async def test_upload_summary_counts_rows_and_errors(
    client, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name=_COLLEGE)
    token = await _admin_token(client, make_admin)

    resp = await _upload(
        client,
        token,
        event.id,
        ["university_id", "full_name", "father_name", "mother_name", "college", "gender"],
        [("400003", "محمد أحمد", "خالد", "سعاد", _COLLEGE, "ذكر")],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["added"] == 0
    assert body["summary"]["total"] == 1
    assert body["summary"]["error_count"] == len(body["errors"]) >= 1


async def test_gpa_accepts_arabic_comma_and_percent(
    client, db, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name=_COLLEGE)
    token = await _admin_token(client, make_admin)

    resp = await _upload(
        client,
        token,
        event.id,
        ["university_id", "full_name", "father_name", "mother_name", "college", "gender", "gpa"],
        [("400004", "محمد أحمد", "خالد", "سعاد", _COLLEGE, "ذكر", "٧٢،٧٩٪")],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["errors"] == []

    record = await _get_record(db, "400004")
    assert record.gpa == Decimal("72.79")


async def test_gender_spellings_are_normalised_on_upload(
    client, db, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name=_COLLEGE)
    token = await _admin_token(client, make_admin)

    rows = [
        ("400005", "محمد أحمد", "خالد", "سعاد", _COLLEGE, "انثى", "80.00"),
        ("400006", "محمد أحمد", "خالد", "سعاد", _COLLEGE, "انثي", "80.00"),
        ("400007", "محمد أحمد", "خالد", "سعاد", _COLLEGE, "female", "80.00"),
        ("400008", "محمد أحمد", "خالد", "سعاد", _COLLEGE, "ذكور", "80.00"),
    ]
    resp = await _upload(
        client,
        token,
        event.id,
        ["university_id", "full_name", "father_name", "mother_name", "college", "gender", "gpa"],
        rows,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["errors"] == []

    for university_id, expected in (
        ("400005", "أنثى"),
        ("400006", "أنثى"),
        ("400007", "أنثى"),
        ("400008", "ذكر"),
    ):
        record = await _get_record(db, university_id)
        assert record.gender == expected


async def test_top_status_column_variants_are_parsed(
    client, db, make_event, make_college, make_admin
):
    event = await make_event()
    await make_college(event.id, name=_COLLEGE)
    token = await _admin_token(client, make_admin)

    rows = [
        ("401001", "نعم"),
        ("401002", "لا"),
        ("401003", "الأول"),
        ("401004", "الثاني"),
        ("401005", "الثالث"),
        ("401006", "من الأوائل"),
    ]
    resp = await _upload(
        client,
        token,
        event.id,
        ["university_id", "full_name", "father_name", "mother_name", "college", "gender", "gpa", "حالة الطالب من الأوائل"],
        [(uid, "محمد أحمد", "خالد", "سعاد", _COLLEGE, "ذكر", "80.00", cell) for uid, cell in rows],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["errors"] == []

    expected = {
        "401001": -1,
        "401002": 0,
        "401003": 1,
        "401004": 2,
        "401005": 3,
        "401006": -1,
    }
    for university_id, value in expected.items():
        record = await _get_record(db, university_id)
        assert record.top_rank_from_file == value


# --------------------------------------------------------------------------- #
# Verification: GPA/phone are never matched (D2)
# --------------------------------------------------------------------------- #
async def test_phone_is_stored_but_never_matched(
    client, make_event, make_college, make_major, make_university_record, db
):
    event = await make_event()
    college = await make_college(event.id, name=_COLLEGE)
    major = await make_major(college.id, name=_MAJOR)
    record = await make_university_record(
        event.id, college.id, university_id="400009", full_name="محمد أحمد",
        father_name="خالد", mother_name="سعاد", gender="ذكر", major_id=major.id,
        gpa=Decimal("80.00"),
    )
    record.phone = "[REDACTED]"
    await db.commit()

    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college.id,
            "university_id": "400009",
            "full_name": "محمد أحمد",
            "father_name": "خالد",
            "mother_name": "سعاد",
            "gender": "ذكر",
            "major_id": major.id,
            "gpa": "10.00",
            "top_rank": 1,
        },
    )
    assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------- #
# Verification: top-student specific errors (D11)
# --------------------------------------------------------------------------- #
async def _make_record_with_top(db, make_event, make_college, make_university_record, top_value):
    event = await make_event()
    college = await make_college(event.id, name=_COLLEGE)
    record = await make_university_record(
        event.id, college.id, university_id="410001", full_name="محمد أحمد",
        father_name="خالد", mother_name="سعاد", gender="ذكر",
        gpa=Decimal("80.00"),
    )
    record.top_rank_from_file = top_value
    await db.commit()
    return college


async def test_top_should_be_honor_when_file_says_top_but_choice_empty(
    client, db, make_event, make_college, make_university_record
):
    college = await _make_record_with_top(
        db, make_event, make_college, make_university_record, -1
    )
    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(college.id, "410001", top_rank=None),
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["code"] == "TOP_RANK_SHOULD_BE_HONOR"
    assert detail["message"] == messages.TOP_RANK_SHOULD_BE_HONOR


async def test_not_honor_when_file_says_not_top_but_choice_claims_top(
    client, db, make_event, make_college, make_university_record
):
    college = await _make_record_with_top(
        db, make_event, make_college, make_university_record, 0
    )
    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(college.id, "410001", top_rank=1),
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["code"] == "TOP_RANK_NOT_HONOR"
    assert detail["message"] == messages.TOP_RANK_NOT_HONOR


async def test_rank_mismatch_when_file_rank_differs(
    client, db, make_event, make_college, make_university_record
):
    college = await _make_record_with_top(
        db, make_event, make_college, make_university_record, 2
    )
    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(college.id, "410001", top_rank=1),
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["code"] == "TOP_RANK_MISMATCH"
    assert detail["message"] == messages.TOP_RANK_MISMATCH


async def test_choice_matching_file_rank_succeeds(
    client, db, make_event, make_college, make_university_record
):
    college = await _make_record_with_top(
        db, make_event, make_college, make_university_record, 2
    )
    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(college.id, "410001", top_rank=2),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["valid"] is True


async def test_identity_mismatch_stays_generic_even_with_wrong_top_choice(
    client, db, make_event, make_college, make_university_record
):
    # Father name differs, and the top choice is also wrong: the D11 detail must
    # NOT leak; the generic message is returned instead.
    college = await _make_record_with_top(
        db, make_event, make_college, make_university_record, 2
    )
    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(
            college.id, "410001", father_name="غير صحيح", top_rank=1
        ),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == messages.GENERIC_VERIFY_FAIL


async def test_already_registered_is_checked_after_top_status(
    client, db, make_event, make_college, make_university_record, make_graduate
):
    college = await _make_record_with_top(
        db, make_event, make_college, make_university_record, 2
    )
    await make_graduate(
        college.id, university_id="410001", email="[REDACTED]"
    )

    # Correct identity + correct top choice -> the already-registered message.
    ok = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(college.id, "410001", top_rank=2),
    )
    assert ok.status_code == 400
    assert ok.json()["detail"] == messages.UNIVERSITY_ID_ALREADY_REGISTERED

    # Wrong top choice -> the top error wins because it is checked first.
    wrong = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(college.id, "410001", top_rank=3),
    )
    assert wrong.status_code == 400
    assert wrong.json()["detail"]["code"] == "TOP_RANK_MISMATCH"


async def test_split_names_payload_matches_split_record(
    client, db, make_event, make_college, make_university_record
):
    event = await make_event()
    college = await make_college(event.id, name=_COLLEGE)
    record = await make_university_record(
        event.id, college.id, university_id="410002", full_name="محمد أحمد",
        father_name="خالد", mother_name="سعاد", gender="ذكر",
        gpa=Decimal("80.00"),
    )
    record.first_name = "محمد"
    record.last_name = "أحمد"
    record.top_rank_from_file = 1
    await db.commit()

    resp = await client.post(
        "/api/graduates/verify-step1",
        json={
            "college_id": college.id,
            "university_id": "410002",
            "first_name": "محمد",
            "last_name": "أحمد",
            "father_name": "خالد",
            "mother_name": "سعاد",
            "gender": "ذكر",
            "top_rank": 1,
        },
    )
    assert resp.status_code == 200, resp.text


async def test_legacy_full_name_payload_matches_split_record(
    client, db, make_event, make_college, make_university_record
):
    event = await make_event()
    college = await make_college(event.id, name=_COLLEGE)
    record = await make_university_record(
        event.id, college.id, university_id="410003", full_name="محمد أحمد",
        father_name="خالد", mother_name="سعاد", gender="ذكر",
        gpa=Decimal("80.00"),
    )
    record.first_name = "محمد"
    record.last_name = "أحمد"
    record.top_rank_from_file = 1
    await db.commit()

    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_verify_payload(college.id, "410003", top_rank=1),
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (0.7272, Decimal("72.72")),
        (1.0, Decimal("100.00")),
        (1, Decimal("100.00")),
        ("72.72%", Decimal("72.72")),
        ("٧٢٫٧٩", Decimal("72.79")),
        ("72،79٪", Decimal("72.79")),
        (3.5, Decimal("3.50")),
        (85, Decimal("85.00")),
        ("85.555", Decimal("85.56")),
        (0, Decimal("0.00")),
        ("", None),
        ("nan", None),
        (None, None),
        ("-1", None),
        ("100.01", None),
        ("12.3.4", None),
        ("abc", None),
    ],
)
def test_parse_gpa_accepts_excel_fractions_and_arabic_formats(raw, expected):
    assert parse_gpa(raw) == expected
