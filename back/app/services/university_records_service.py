import io
import json
import pandas as pd
from datetime import UTC, datetime
from typing import List, Dict, Any
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.university_record import UniversityRecordModel
from app.models.college import CollegeModel
from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.audit_log import AuditLogModel
from app.services.graduate_service import normalize_arabic
from app.core.redis import redis_client


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


async def parse_file(file: UploadFile) -> List[Dict[str, Any]]:
    contents = await file.read()
    filename = file.filename.lower()
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
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

    df.columns = [str(c).strip().lower() for c in df.columns]
    return df.to_dict(orient="records")


async def validate_records(records: List[Dict[str, Any]], event_id: int, db: AsyncSession) -> List[str]:
    errors = []
    required_cols = {"university_id", "full_name", "father_name", "mother_name", "college", "gender"}

    if not records:
        return ["الملف فارغ أو لا يحتوي على بيانات."]

    file_cols = set(records[0].keys())
    missing_cols = required_cols - file_cols
    if missing_cols:
        return [f"الأعمدة التالية مفقودة في الملف: {', '.join(missing_cols)}"]

    # Fetch colleges linked to this event and build normalized lookup dictionary
    colleges_res = await db.execute(select(CollegeModel).where(CollegeModel.event_id == event_id))
    colleges = colleges_res.scalars().all()
    college_map = {normalize_arabic(c.name): c.id for c in colleges}

    seen_uni_ids = set()

    for idx, row in enumerate(records, start=2): # Row 1 is header
        uni_id = str(row.get("university_id", "")).strip()
        full_name = str(row.get("full_name", "")).strip()
        father_name = str(row.get("father_name", "")).strip()
        mother_name = str(row.get("mother_name", "")).strip()
        college_name = str(row.get("college", "")).strip()
        gender = str(row.get("gender", "")).strip()

        # Check empty required fields
        if not uni_id or uni_id.lower() == "nan":
            errors.append(f"السطر {idx}: الرقم الجامعي مطلوب.")
        if not full_name or full_name.lower() == "nan":
            errors.append(f"السطر {idx}: الاسم الكامل مطلوب.")
        if not father_name or father_name.lower() == "nan":
            errors.append(f"السطر {idx}: اسم الأب مطلوب.")
        if not mother_name or mother_name.lower() == "nan":
            errors.append(f"السطر {idx}: اسم الأم مطلوب.")
        if not college_name or college_name.lower() == "nan":
            errors.append(f"السطر {idx}: الكلية مطلوبة.")
        if not gender or gender.lower() == "nan":
            errors.append(f"السطر {idx}: الجنس مطلوب.")

        # Check duplicate university_id within file
        if uni_id in seen_uni_ids:
            errors.append(f"السطر {idx}: الرقم الجامعي '{uni_id}' مكرر داخل الملف.")
        else:
            seen_uni_ids.add(uni_id)

        # Check valid gender
        if gender not in ["ذكر", "أنثى"]:
            errors.append(f"السطر {idx}: قيمة الجنس غير صحيحة '{gender}' (يجب أن تكون 'ذكر' أو 'أنثى').")

        # Check non-existent college names using normalized lookup
        normalized_college_name = normalize_arabic(college_name)
        if normalized_college_name not in college_map:
            errors.append(f'الكلية "{college_name}" المذكورة في الملف غير مربوطة بهذا الحفل')

    return errors


async def upsert_records(records: List[Dict[str, Any]], event_id: int, db: AsyncSession) -> Dict[str, int]:
    colleges_res = await db.execute(select(CollegeModel).where(CollegeModel.event_id == event_id))
    colleges = colleges_res.scalars().all()
    college_map = {normalize_arabic(c.name): c.id for c in colleges}

    added = 0
    updated = 0
    skipped = 0
    now = datetime.now(UTC)

    for row in records:
        uni_id = str(row.get("university_id", "")).strip()
        full_name = normalize_arabic(str(row.get("full_name", "")))
        father_name = normalize_arabic(str(row.get("father_name", "")))
        mother_name = normalize_arabic(str(row.get("mother_name", "")))
        college_name = str(row.get("college", "")).strip()
        gender = str(row.get("gender", "")).strip()
        
        normalized_college_name = normalize_arabic(college_name)
        college_id = college_map.get(normalized_college_name)

        if not college_id:
            skipped += 1
            continue

        existing_res = await db.execute(
            select(UniversityRecordModel).where(
                UniversityRecordModel.event_id == event_id,
                UniversityRecordModel.university_id == uni_id
            )
        )
        existing = existing_res.scalar_one_or_none()

        if existing:
            existing.full_name = full_name
            existing.father_name = father_name
            existing.mother_name = mother_name
            existing.gender = gender
            existing.college_id = college_id
            existing.imported_at = now
            db.add(existing)
            updated += 1
        else:
            new_rec = UniversityRecordModel(
                event_id=event_id,
                university_id=uni_id,
                full_name=full_name,
                father_name=father_name,
                mother_name=mother_name,
                gender=gender,
                college_id=college_id,
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
    errors = await validate_records(records, event_id, db)

    if errors:
        await db.rollback()
        return {
            "added": 0,
            "updated": 0,
            "skipped": 0,
            "errors": errors
        }

    counts = await upsert_records(records, event_id, db)

    audit_log = AuditLogModel(
        actor_type="ADMIN",
        actor_id=admin["admin_id"],
        action="UPLOAD_UNIVERSITY_RECORDS",
        target=f"event_id={event_id}",
        details=f"Added {counts['added']}, Updated {counts['updated']} records"
    )
    db.add(audit_log)
    await db.commit()

    await invalidate_uni_records_cache(event_id)

    return {
        "added": counts["added"],
        "updated": counts["updated"],
        "skipped": counts["skipped"],
        "errors": []
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

    stmt = select(UniversityRecordModel).where(UniversityRecordModel.event_id == event_id)
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
    items = res.scalars().all()

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
            "imported_at": r.imported_at.isoformat() if r.imported_at else None,
        }
        for r in items
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

    audit_log = AuditLogModel(
        actor_type="ADMIN",
        actor_id=admin["admin_id"],
        action="DELETE_UNIVERSITY_RECORD",
        target=f"record_id={record_id}",
        details=f"Deleted university record for university_id={uni_id}"
    )
    db.add(audit_log)
    await db.commit()

    await invalidate_uni_records_cache(event_id)

    return {"status": "success", "message": "تم حذف السجل الجامعي بنجاح."}
