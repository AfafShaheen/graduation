import io
import json
import re
import pandas as pd
from datetime import UTC, datetime
from decimal import Decimal
from typing import List, Dict, Any
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.university_record import UniversityRecordModel
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.major import MajorModel
from app.services.graduate_service import normalize_arabic
from app.services.audit_log import ActorType, record_audit
from app.core.redis import redis_client


def parse_gpa(val: Any) -> Decimal | None:
    """Parse the Affairs ``المعدل`` cell into a 0-100 percentage.

    Accepts Arabic-Indic digits, the Arabic decimal separator, thousands
    commas and a trailing percent sign. Excel stores percentage-formatted
    cells as raw fractions (``72.72%`` is read as ``0.7272``), so a value in
    ``(0, 1]`` is treated as a fraction and scaled by 100. Any parse failure
    or out-of-range value yields ``None`` (the caller reports it as invalid).
    """
    if val is None or pd.isna(val) or str(val).strip() == "" or str(val).lower() == "nan":
        return None
    s = str(val).strip()
    arabic_indic = "٠١٢٣٤٥٦٧٨٩"
    ascii_digits = "0123456789"
    trans = str.maketrans(arabic_indic, ascii_digits)
    s = s.translate(trans)
    s = s.replace("٪", "").replace("%", "").strip()
    s = s.replace("٫", ".").replace(",", ".").replace("،", ".")
    try:
        d = Decimal(s)
    except Exception:
        return None
    if 0 < d <= 1:
        d = d * 100
    if d < 0 or d > 100:
        return None
    return d.quantize(Decimal("0.01"))


_GENDER_MAP = {
    "ذكر": "ذكر",
    "male": "ذكر",
    "m": "ذكر",
    "ذكور": "ذكر",
    "انثي": "أنثى",
    "انثى": "أنثى",
    "اناث": "أنثى",
    "female": "أنثى",
    "f": "أنثى",
}

_TOP_NOT_HONOR = {"لا", "ليس", "غير", "no", "false", "0"}
_TOP_YES = {"نعم", "yes", "true", "y"}


def normalize_gender(value: Any) -> str | None:
    """Return the canonical gender (``ذكر``/``أنثى``) or ``None`` when unknown.

    Accepts the Arabic spellings the Affairs office may use (أنثى/انثى/انثي) as
    well as the English values older clients sent (D8).
    """
    if value is None:
        return None
    text = normalize_arabic(str(value)).casefold()
    return _GENDER_MAP.get(text)


def normalize_phone(value: Any) -> str | None:
    """Normalise a contact number to digits with an optional leading ``+``.

    The contact number from the file is stored for reference only and is never
    matched against the graduate's input (D1, item A2.4).
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    arabic_indic = "٠١٢٣٤٥٦٧٨٩"
    ascii_digits = "[REDACTED]"
    text = text.translate(str.maketrans(arabic_indic, ascii_digits))
    leading_plus = text.startswith("+")
    digits = re.sub(r"[^0-9]", "", text)
    if not digits:
        return None
    return ("+" if leading_plus else "") + digits


def parse_top_status_from_file(value: Any) -> int | None:
    """Parse the ``حالة الطالب من الأوائل`` cell into a stored code (A2.3).

    Returns one of:
    - ``None``: no usable information (column absent/empty) -> fall back to the
      dense rank computed from the GPA.
    - ``0``: the file says the student is *not* among the top students.
    - ``-1``: the file says the student *is* among the top students but does not
      name the rank.
    - ``1``/``2``/``3``: the file names the student's rank.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    normalized = normalize_arabic(text).casefold()
    if normalized in _TOP_NOT_HONOR:
        return 0
    if normalized in {"1", "١"}:
        return 1
    if normalized in {"2", "٢"}:
        return 2
    if normalized in {"3", "٣"}:
        return 3
    if "ثالث" in normalized:
        return 3
    if "ثاني" in normalized:
        return 2
    if "اول" in normalized:
        return 1
    if normalized in _TOP_YES or "اوائل" in normalized:
        return -1
    return None


def split_full_name(full_name: str | None) -> tuple[str, str]:
    """Split a legacy full name into ``(first_name, last_name)`` (D4)."""
    normalized = normalize_arabic(full_name or "")
    first, _, last = normalized.partition(" ")
    return first, last


def _cell_text(row: Dict[str, Any], key: str) -> str:
    """Return a clean string cell from a parsed row (empty for NaN/None).

    Excel parses numeric cells as floats, so an integer university id can
    arrive as ``12345678.0`` and would never match typed input. Integral
    values and ``"<digits>.0"`` strings are rendered without the trailing
    decimal part.
    """
    if key not in row:
        return ""
    value = row.get(key)
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


async def invalidate_uni_records_cache(event_id: int) -> None:
    try:
        keys = await redis_client.keys(f"uni_records:{event_id}:*")
        if keys:
            await redis_client.delete(*keys)
        admin_keys = await redis_client.keys("admin:graduates:*")
        if admin_keys:
            await redis_client.delete(*admin_keys)
    except Exception:
        pass


# Canonical field name -> Arabic column header. The dict order is the canonical
# order used in error messages. English names are the canonical keys
# themselves, so both "university_id" and "الرقم الجامعي" are accepted. Extend
# this mapping to accept more header aliases later.
ARABIC_HEADERS = {
    "university_id": "الرقم الجامعي",
    "full_name": "الاسم الكامل",
    "father_name": "اسم الأب",
    "mother_name": "اسم الأم",
    "college": "الكلية",
    "gender": "الجنس",
    "gpa": "المعدل",
    "major": "التخصص",
    "first_name": "الاسم",
    "last_name": "الكنية",
    "top_status": "حالة الطالب من الأوائل",
    "phone": "رقم التواصل",
}

# Extra accepted headers per field, beyond the primary Arabic label and the
# canonical English name (both added automatically). All are normalised before
# comparison so orthography variants (ة/ه, أ/ا) match (A1.2).
_EXTRA_HEADER_ALIASES = {
    "first_name": ["الاسم الأول", "اسم الطالب", "first name", "firstname"],
    "last_name": ["الكنيه", "الشهرة", "اسم العائلة", "last name", "lastname", "surname"],
    "top_status": ["حالة الطالب", "من الأوائل", "الأوائل", "الترتيب", "top status"],
    "phone": ["رقم الاتصال", "رقم الهاتف", "الهاتف", "الجوال", "الموبايل", "phone", "mobile"],
}

# Zero-width and bidirectional control marks Excel/LibreOffice may embed in a
# header cell (RLM, LRM, ZWSP, ...). They carry no meaning for matching.
_INVISIBLE_MARKS = dict.fromkeys(
    [
        0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
        0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
        0x2066, 0x2067, 0x2068, 0x2069,
    ]
)

_CSV_DELIMITERS = (",", ";", "\t")


def _normalize_header(value: Any) -> str:
    """Normalise a header cell so Arabic and English aliases can be compared.

    Removes the BOM and zero-width/bidirectional marks, turns NBSP into a
    regular space, collapses whitespace, then applies ``normalize_arabic``
    (hamza/ta-marbuta/ya unification) and ``casefold`` so that
    "اسم الأب"/"اسم الاب", "الكلية"/"الكليه" and "University_ID"/"university_id"
    all match.
    """
    text = str(value)
    text = text.replace("\ufeff", "")
    text = text.translate(_INVISIBLE_MARKS)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return normalize_arabic(text).casefold()


def _header_aliases() -> Dict[str, str]:
    """Map every accepted normalised header (Arabic and English) to its field."""
    aliases: Dict[str, str] = {}
    for canonical, arabic in ARABIC_HEADERS.items():
        aliases[_normalize_header(arabic)] = canonical
        aliases[_normalize_header(canonical)] = canonical
    for canonical, variants in _EXTRA_HEADER_ALIASES.items():
        for variant in variants:
            aliases.setdefault(_normalize_header(variant), canonical)
    return aliases


def _canonicalize_columns(columns) -> List[str]:
    """Rename recognised columns to their canonical English field name.

    Arabic, English and mixed headers are all accepted. A column that matches
    nothing keeps the legacy behaviour (stripped and lowercased) and stays
    ignored by validation. Two source columns mapping to the same field is a
    hard error, reported together with the two offending headers.
    """
    aliases = _header_aliases()
    resolved: List[str] = []
    seen: Dict[str, str] = {}
    for column in columns:
        canonical = aliases.get(_normalize_header(column))
        if canonical is None:
            resolved.append(str(column).strip().lower())
            continue
        if canonical in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f'عمودان في الملف يمثلان الحقل نفسه "{ARABIC_HEADERS[canonical]}": '
                    f'"{seen[canonical]}" و "{str(column)}".'
                ),
            )
        seen[canonical] = str(column)
        resolved.append(canonical)
    return resolved


def _detect_csv_delimiter(text: str) -> str:
    """Pick the most frequent delimiter in the header line (, ; or tab)."""
    lines = text.splitlines()
    first_line = lines[0] if lines else ""
    counts = {delimiter: first_line.count(delimiter) for delimiter in _CSV_DELIMITERS}
    best = max(counts, key=lambda delimiter: counts[delimiter])
    return best if counts[best] else ","


def _read_csv(contents: bytes) -> "pd.DataFrame":
    """Read a CSV file tolerant of Arabic Windows exports.

    Decodes as ``utf-8-sig`` then falls back to ``cp1256`` (the encoding Excel
    uses on Arabic Windows), and detects the delimiter (comma, semicolon or
    tab) from the header line. A NUL byte means the payload is binary, not a
    text CSV, so it is rejected like any other unreadable file.
    """
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = contents.decode("cp1256")
    if "\x00" in text:
        raise ValueError("الملف يبدو ثنائياً وليس ملف CSV نصي صالح.")
    return pd.read_csv(io.StringIO(text), sep=_detect_csv_delimiter(text))


async def parse_file(file: UploadFile) -> List[Dict[str, Any]]:
    contents = await file.read()
    filename = file.filename.lower()
    try:
        if filename.endswith(".csv"):
            df = _read_csv(contents)
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="نوع الملف غير مدعوم. يرجى رفع ملف Excel (.xlsx) أو CSV (.csv)."
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"فشل في قراءة الملف: {str(e)}"
        )

    df.columns = _canonicalize_columns(df.columns)
    return df.to_dict(orient="records")


async def validate_records(records: List[Dict[str, Any]], event_id: int, db: AsyncSession) -> List[str]:
    errors = []
    required_cols = {"university_id", "father_name", "mother_name", "college", "gender", "gpa"}

    if not records:
        return ["الملف فارغ أو لا يحتوي على بيانات."]

    file_cols = set(records[0].keys())
    missing_cols = required_cols - file_cols
    # Names may come either as two columns (first_name/last_name, D4) or as the
    # legacy single "الاسم الكامل" column.
    has_split_names = {"first_name", "last_name"}.issubset(file_cols)
    has_full_name = "full_name" in file_cols
    name_missing = not has_split_names and not has_full_name
    if missing_cols or name_missing:
        missing_arabic = [
            ARABIC_HEADERS[field] for field in ARABIC_HEADERS if field in missing_cols
        ]
        if name_missing:
            missing_arabic.extend([ARABIC_HEADERS["first_name"], ARABIC_HEADERS["last_name"]])
        return [f"الأعمدة التالية مفقودة في الملف: {'، '.join(missing_arabic)}"]

    # Fetch colleges linked to this event and build normalized lookup dictionary
    colleges_res = await db.execute(select(CollegeModel).where(CollegeModel.event_id == event_id))
    colleges = colleges_res.scalars().all()
    college_map = {normalize_arabic(c.name): c.id for c in colleges}

    # Load all majors once into a dict keyed by (college_id, normalize_arabic(name))
    majors_res = await db.execute(select(MajorModel))
    all_majors = majors_res.scalars().all()
    major_map = {(m.college_id, normalize_arabic(m.name)): m.id for m in all_majors}

    seen_uni_ids = set()

    for idx, row in enumerate(records, start=2): # Row 1 is header
        uni_id = _cell_text(row, "university_id")
        first_name = _cell_text(row, "first_name")
        last_name = _cell_text(row, "last_name")
        full_name = _cell_text(row, "full_name")
        father_name = _cell_text(row, "father_name")
        mother_name = _cell_text(row, "mother_name")
        college_name = _cell_text(row, "college")
        gender = _cell_text(row, "gender")
        gpa_raw = row.get("gpa")
        major_raw = _cell_text(row, "major")

        # Check empty required fields
        if not uni_id:
            errors.append(f"السطر {idx}: الرقم الجامعي مطلوب.")
        if has_split_names and not has_full_name:
            if not first_name:
                errors.append(f"السطر {idx}: الاسم مطلوب.")
            if not last_name:
                errors.append(f"السطر {idx}: الكنية مطلوبة.")
        elif not full_name and not (first_name and last_name):
            errors.append(f"السطر {idx}: الاسم الكامل مطلوب.")
        if not father_name:
            errors.append(f"السطر {idx}: اسم الأب مطلوب.")
        if not mother_name:
            errors.append(f"السطر {idx}: اسم الأم مطلوب.")
        if not college_name:
            errors.append(f"السطر {idx}: الكلية مطلوبة.")
        if not gender:
            errors.append(f"السطر {idx}: الجنس مطلوب.")

        # Check GPA
        if gpa_raw is None or str(gpa_raw).strip() == "" or str(gpa_raw).lower() == "nan":
            errors.append(f"السطر {idx}: المعدل مطلوب.")
        else:
            parsed_gpa = parse_gpa(gpa_raw)
            if parsed_gpa is None:
                errors.append(f"السطر {idx}: المعدل غير صالح.")

        # Check duplicate university_id within file
        if uni_id in seen_uni_ids:
            errors.append(f"السطر {idx}: الرقم الجامعي '{uni_id}' مكرر داخل الملف.")
        else:
            seen_uni_ids.add(uni_id)

        # Check valid gender (accepts the Affairs spellings, item A2.1)
        if gender and normalize_gender(gender) is None:
            errors.append(f"السطر {idx}: قيمة الجنس غير صحيحة '{gender}' (يجب أن تكون 'ذكر' أو 'أنثى').")

        # Check non-existent college names using normalized lookup
        normalized_college_name = normalize_arabic(college_name)
        college_id = college_map.get(normalized_college_name)
        if not college_id:
            errors.append(f'الكلية "{college_name}" المذكورة في الملف غير مربوطة بهذا الحفل')
        else:
            # Check major if provided and not empty / NaN / "لا يوجد"
            if major_raw and major_raw.lower() not in ["nan", "none", "لا يوجد", ""]:
                norm_major = normalize_arabic(major_raw)
                if (college_id, norm_major) not in major_map:
                    errors.append(f'السطر {idx}: التخصص "{major_raw}" غير موجود ضمن كلية "{college_name}". يرجى إضافته من إدارة التخصصات أولاً.')

    return errors


async def upsert_records(records: List[Dict[str, Any]], event_id: int, db: AsyncSession) -> Dict[str, int]:
    colleges_res = await db.execute(select(CollegeModel).where(CollegeModel.event_id == event_id))
    colleges = colleges_res.scalars().all()
    college_map = {normalize_arabic(c.name): c.id for c in colleges}

    majors_res = await db.execute(select(MajorModel))
    all_majors = majors_res.scalars().all()
    major_map = {(m.college_id, normalize_arabic(m.name)): m.id for m in all_majors}

    added = 0
    updated = 0
    skipped = 0
    now = datetime.now(UTC)

    for row in records:
        uni_id = _cell_text(row, "university_id")
        first_name_raw = _cell_text(row, "first_name")
        last_name_raw = _cell_text(row, "last_name")
        legacy_full = _cell_text(row, "full_name")
        if first_name_raw or last_name_raw:
            first_name = normalize_arabic(first_name_raw) or None
            last_name = normalize_arabic(last_name_raw) or None
            full_name = normalize_arabic(" ".join(p for p in (first_name, last_name) if p))
        else:
            first_name = None
            last_name = None
            full_name = normalize_arabic(legacy_full)
        father_name = normalize_arabic(_cell_text(row, "father_name"))
        mother_name = normalize_arabic(_cell_text(row, "mother_name"))
        college_name = _cell_text(row, "college")
        gender = normalize_gender(_cell_text(row, "gender")) or _cell_text(row, "gender")
        gpa_val = parse_gpa(row.get("gpa"))
        major_raw = _cell_text(row, "major")
        top_rank_from_file = (
            parse_top_status_from_file(row.get("top_status")) if "top_status" in row else None
        )
        phone = normalize_phone(row.get("phone")) if "phone" in row else None
        
        normalized_college_name = normalize_arabic(college_name)
        college_id = college_map.get(normalized_college_name)

        if not college_id:
            skipped += 1
            continue

        major_id = None
        if major_raw and major_raw.lower() not in ["nan", "none", "لا يوجد", ""]:
            norm_major = normalize_arabic(major_raw)
            major_id = major_map.get((college_id, norm_major))

        existing_res = await db.execute(
            select(UniversityRecordModel).where(
                UniversityRecordModel.event_id == event_id,
                UniversityRecordModel.university_id == uni_id
            )
        )
        existing = existing_res.scalar_one_or_none()

        if existing:
            existing.full_name = full_name
            existing.first_name = first_name
            existing.last_name = last_name
            existing.father_name = father_name
            existing.mother_name = mother_name
            existing.gender = gender
            existing.college_id = college_id
            existing.major_id = major_id
            existing.gpa = gpa_val
            existing.top_rank_from_file = top_rank_from_file
            existing.phone = phone
            existing.imported_at = now
            db.add(existing)
            updated += 1
        else:
            new_rec = UniversityRecordModel(
                event_id=event_id,
                university_id=uni_id,
                full_name=full_name,
                first_name=first_name,
                last_name=last_name,
                father_name=father_name,
                mother_name=mother_name,
                gender=gender,
                college_id=college_id,
                major_id=major_id,
                gpa=gpa_val,
                top_rank_from_file=top_rank_from_file,
                phone=phone,
                imported_at=now
            )
            db.add(new_rec)
            added += 1

    return {"added": added, "updated": updated, "skipped": skipped}


async def upload_university_records(
    file: UploadFile,
    event_id: int,
    admin: dict,
    db: AsyncSession
) -> Dict[str, Any]:
    # Validate event existence
    event = await db.get(EventModel, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على الحفل المحدد."
        )

    records = await parse_file(file)
    total = len(records)
    errors = await validate_records(records, event_id, db)

    if errors:
        await db.rollback()
        return {
            "added": 0,
            "updated": 0,
            "skipped": 0,
            "errors": errors,
            "summary": {
                "total": total,
                "added": 0,
                "updated": 0,
                "skipped": 0,
                "error_count": len(errors),
            },
        }

    counts = await upsert_records(records, event_id, db)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "UPLOAD_UNIVERSITY_RECORDS",
        f"event_id={event_id}",
        f"Added {counts['added']}, Updated {counts['updated']} records",
        event_id=event_id,
    )
    await db.commit()

    await invalidate_uni_records_cache(event_id)

    return {
        "added": counts["added"],
        "updated": counts["updated"],
        "skipped": counts["skipped"],
        "errors": [],
        "summary": {
            "total": total,
            "added": counts["added"],
            "updated": counts["updated"],
            "skipped": counts["skipped"],
            "error_count": 0,
        },
    }


async def list_university_records(
    event_id: int,
    search: str | None,
    college_id: int | None,
    skip: int,
    limit: int,
    db: AsyncSession
) -> dict:
    # Validate event existence
    event = await db.get(EventModel, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على الحفل المحدد."
        )

    cache_key = f"uni_records:{event_id}:search={search}:college={college_id}:skip={skip}:limit={limit}"
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    stmt = (
        select(UniversityRecordModel, MajorModel.name.label("major_name"))
        .outerjoin(MajorModel, UniversityRecordModel.major_id == MajorModel.id)
        .where(UniversityRecordModel.event_id == event_id)
    )
    pattern = None
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            (UniversityRecordModel.full_name.ilike(pattern)) |
            (UniversityRecordModel.university_id.ilike(pattern))
        )
    if college_id:
        stmt = stmt.where(UniversityRecordModel.college_id == college_id)

    count_stmt = select(UniversityRecordModel).where(UniversityRecordModel.event_id == event_id)
    if search and pattern:
        count_stmt = count_stmt.where(
            (UniversityRecordModel.full_name.ilike(pattern)) |
            (UniversityRecordModel.university_id.ilike(pattern))
        )
    if college_id:
        count_stmt = count_stmt.where(UniversityRecordModel.college_id == college_id)

    total_res = await db.execute(count_stmt)
    total = len(total_res.scalars().all())

    stmt = stmt.offset(skip).limit(limit)
    res = await db.execute(stmt)
    items = res.all()

    items_data = [
        {
            "id": r.id,
            "event_id": r.event_id,
            "university_id": r.university_id,
            "full_name": r.full_name,
            "father_name": r.father_name,
            "mother_name": r.mother_name,
            "gender": r.gender,
            "college_id": r.college_id,
            "major_id": r.major_id,
            "major_name": major_name,
            "gpa": str(r.gpa) if r.gpa is not None else None,
            "imported_at": r.imported_at.isoformat() if r.imported_at else None,
        }
        for r, major_name in items
    ]

    result = {"total": total, "items": items_data}

    try:
        await redis_client.setex(cache_key, 300, json.dumps(result))
    except Exception:
        pass

    return result


async def delete_university_record(record_id: int, admin: dict, db: AsyncSession) -> dict:
    record = await db.get(UniversityRecordModel, record_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على السجل الجامعي.")

    grad_res = await db.execute(
        select(GraduateModel).where(
            GraduateModel.university_id == record.university_id,
            GraduateModel.college_id == record.college_id
        )
    )
    if grad_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن حذف هذا السجل لأن الخريج قد سجّل بالفعل."
        )

    event_id = record.event_id
    uni_id = record.university_id

    await db.delete(record)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "DELETE_UNIVERSITY_RECORD",
        f"record_id={record_id}",
        f"Deleted university record for university_id={uni_id}",
        event_id=event_id,
    )
    await db.commit()

    await invalidate_uni_records_cache(event_id)

    return {"status": "success", "message": "تم حذف السجل الجامعي بنجاح."}
