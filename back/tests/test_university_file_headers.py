"""Item F6: the university-records importer accepts Arabic headers.

The admin UI shows and downloads an Arabic template (SRS FR-15 / 4.4), so the
upload endpoint must accept the Arabic column names in addition to the English
ones, and must read Arabic Windows exports (cp1256, semicolon separated). The
endpoint contract (URL, parameters, response shape, status codes) is unchanged.
"""

from io import BytesIO

from openpyxl import Workbook

from app.services.university_records_service import (
    _detect_csv_delimiter,
    _normalize_header,
)

_AT = "@"
_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"

_CSV_CT = "text/csv"
_XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_COLLEGE = "كلية الهندسة المعلوماتية"
_AR_HEADERS = [
    "الرقم الجامعي",
    "الاسم الكامل",
    "اسم الأب",
    "اسم الأم",
    "الكلية",
    "الجنس",
    "المعدل",
]
_EN_HEADERS = [
    "university_id",
    "full_name",
    "father_name",
    "mother_name",
    "college",
    "gender",
    "gpa",
]
_ROW = ("900010", "محمد أحمد علي", "أحمد", "سعاد", _COLLEGE, "ذكر", "85.50")


def _auth(value):
    return {"Authorization": "Bearer " + value}


async def _admin_headers(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return _auth(response.json()["access_token"])


async def _event(make_event, make_college):
    event = await make_event()
    await make_college(event.id, name=_COLLEGE)
    return event


def _csv_bytes(headers, rows, encoding="utf-8-sig", delimiter=","):
    lines = [delimiter.join(headers)]
    for row in rows:
        lines.append(delimiter.join(str(cell) for cell in row))
    return ("\n".join(lines) + "\n").encode(encoding)


def _xlsx_bytes(headers, rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(list(headers))
    for row in rows:
        sheet.append(list(row))
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def _upload(client, headers, event_id, filename, content, content_type):
    return await client.post(
        f"/api/admin/events/{event_id}/university-records",
        files={"file": (filename, content, content_type)},
        headers=headers,
    )


def test_normalize_header_equivalences():
    assert _normalize_header("اسم الأب") == _normalize_header("اسم الاب")
    assert _normalize_header("الكلية") == _normalize_header("الكليه")
    assert _normalize_header("University_ID") == _normalize_header("university_id")
    assert _normalize_header("\ufeffالاسم الكامل") == _normalize_header("الاسم الكامل")
    assert _normalize_header("\u200fالاسم الكامل") == _normalize_header("الاسم الكامل")
    assert _normalize_header("الاسم\u00a0الكامل") == _normalize_header("الاسم الكامل")


def test_detect_csv_delimiter():
    assert _detect_csv_delimiter("a;b;c\n1;2;3") == ";"
    assert _detect_csv_delimiter("a,b,c\n1,2,3") == ","
    assert _detect_csv_delimiter("a\tb\tc") == "\t"
    assert _detect_csv_delimiter("single") == ","


async def test_arabic_headers_csv_imports(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(_AR_HEADERS, [_ROW]), _CSV_CT
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["added"] == 1


async def test_english_headers_csv_still_imports(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(_EN_HEADERS, [_ROW]), _CSV_CT
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["added"] == 1


async def test_mixed_headers_csv_imports(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)
    mixed = [
        "university_id",
        "الاسم الكامل",
        "father_name",
        "اسم الأم",
        "college",
        "الجنس",
        "المعدل",
    ]

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(mixed, [_ROW]), _CSV_CT
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["added"] == 1


async def test_arabic_header_variants_match(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)
    variants = [
        "الرقم الجامعي",
        "الاسم الكامل",
        "اسم الاب",
        "اسم الام",
        "الكليه",
        "الجنس",
        "المعدل",
    ]

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(variants, [_ROW]), _CSV_CT
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["added"] == 1


async def test_invisible_marks_in_headers_match(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)
    marked = [
        "\ufeffالرقم الجامعي",
        "\u200fالاسم الكامل",
        "اسم الأب",
        "اسم الأم",
        "الكلية",
        "الجنس",
        "المعدل",
    ]

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(marked, [_ROW]), _CSV_CT
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["added"] == 1


async def test_arabic_headers_xlsx_imports(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)

    response = await _upload(
        client, headers, event.id, "records.xlsx", _xlsx_bytes(_AR_HEADERS, [_ROW]), _XLSX_CT
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["added"] == 1


async def test_one_missing_column_reports_its_arabic_name(
    client, make_event, make_college, make_admin
):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)
    index = _AR_HEADERS.index("الجنس")
    file_headers = [h for i, h in enumerate(_AR_HEADERS) if i != index]
    file_row = tuple(c for i, c in enumerate(_ROW) if i != index)

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(file_headers, [file_row]), _CSV_CT
    )

    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert "الجنس" in detail


async def test_several_missing_columns_are_in_canonical_order(
    client, make_event, make_college, make_admin
):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)
    file_headers = _EN_HEADERS[:2]
    file_row = _ROW[:2]

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(file_headers, [file_row]), _CSV_CT
    )

    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert detail == "الأعمدة التالية مفقودة في الملف: اسم الأب، اسم الأم، الكلية، الجنس، المعدل"


async def test_duplicate_field_mapping_is_rejected(
    client, make_event, make_college, make_admin
):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)
    duplicated = [
        "university_id",
        "الرقم الجامعي",
        "full_name",
        "father_name",
        "mother_name",
        "college",
        "gender",
    ]
    duplicated_row = (_ROW[0], _ROW[0], *_ROW[1:])

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(duplicated, [duplicated_row]), _CSV_CT
    )

    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert "الرقم الجامعي" in detail
    assert "university_id" in detail


async def test_extra_columns_are_ignored(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)
    file_headers = _EN_HEADERS + ["notes", "ملاحظات"]
    file_row = _ROW + ("x", "y")

    response = await _upload(
        client, headers, event.id, "records.csv", _csv_bytes(file_headers, [file_row]), _CSV_CT
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["added"] == 1


async def test_csv_encodings_and_separators_import_identically(
    client, make_event, make_college, make_admin
):
    headers = await _admin_headers(client, make_admin)
    payloads = [
        _csv_bytes(_AR_HEADERS, [_ROW], encoding="utf-8-sig", delimiter=","),
        _csv_bytes(_AR_HEADERS, [_ROW], encoding="cp1256", delimiter=";"),
        _csv_bytes(_AR_HEADERS, [_ROW], encoding="utf-8-sig", delimiter="\t"),
    ]

    bodies = []
    for content in payloads:
        event = await _event(make_event, make_college)
        response = await _upload(client, headers, event.id, "records.csv", content, _CSV_CT)
        assert response.status_code == 200, response.text
        bodies.append(response.json())

    assert all(body["errors"] == [] and body["added"] == 1 for body in bodies)
    assert bodies[0] == bodies[1] == bodies[2]


async def test_binary_csv_file_is_rejected(client, make_event, make_college, make_admin):
    headers = await _admin_headers(client, make_admin)
    event = await _event(make_event, make_college)

    response = await _upload(
        client, headers, event.id, "records.csv", b"\xff\xfe\x00\x00\x01\x02", _CSV_CT
    )

    assert response.status_code == 400, response.text

