import os
import uuid
from typing import Any, Dict

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import EventModel
from app.models.university_file import UniversityFileModel
from app.models.university_record import UniversityRecordModel
from app.services.audit_log import ActorType, record_audit
from app.services.university_records_service import (
    invalidate_uni_records_cache,
    parse_file,
    upsert_records,
    validate_records,
)

STORAGE_DIR = os.getenv("UNIVERSITY_FILES_DIR", "/app/storage/university_files")

_ALLOWED_EXTENSIONS = (".xlsx", ".xls", ".csv")


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "").strip() or "file"
    return base.replace("\x00", "")


def _storage_path(stored_name: str) -> str:
    return os.path.join(STORAGE_DIR, stored_name)


class _BytesUpload:
    """غلاف بسيط يقلّد UploadFile ليمرَّر إلى parse_file المحلي."""

    def __init__(self, filename: str, content_type: str | None, data: bytes):
        self.filename = filename
        self.content_type = content_type
        self._data = data

    async def read(self) -> bytes:
        return self._data

    async def seek(self, _pos: int) -> None:
        return None


async def _event_or_404(db: AsyncSession, event_id: int) -> EventModel:
    event = await db.get(EventModel, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على الحفل المحدد.",
        )
    return event


async def _build_file_item(db: AsyncSession, record: UniversityFileModel) -> Dict[str, Any]:
    rows = (
        await db.execute(
            select(
                UniversityRecordModel.college_id,
                func.count(UniversityRecordModel.id),
            )
            .where(UniversityRecordModel.event_id == record.event_id)
            .group_by(UniversityRecordModel.college_id)
        )
    ).all()
    college_ids = [row[0] for row in rows]
    names: Dict[int, str] = {}
    if college_ids:
        from app.models.college import CollegeModel

        colleges = (
            await db.execute(
                select(CollegeModel.id, CollegeModel.name).where(
                    CollegeModel.id.in_(college_ids)
                )
            )
        ).all()
        names = {cid: name for cid, name in colleges}

    colleges_payload = [
        {"college_id": cid, "name": names.get(cid, ""), "rows": count}
        for cid, count in rows
    ]

    event_name = None
    if record.event_id is not None:
        event = await db.get(EventModel, record.event_id)
        event_name = event.name if event else None

    return {
        "id": record.id,
        "event_id": record.event_id,
        "event_name": event_name,
        "original_name": record.original_name,
        "size_bytes": record.size_bytes,
        "rows_total": record.rows_total,
        "rows_imported": record.rows_imported,
        "rows_updated": record.rows_updated,
        "rows_skipped": record.rows_skipped,
        "status": record.status,
        "colleges": colleges_payload,
        "created_at": record.created_at,
    }


async def list_university_files(db: AsyncSession) -> Dict[str, Any]:
    records = (
        await db.execute(
            select(UniversityFileModel).order_by(UniversityFileModel.created_at.desc())
        )
    ).scalars().all()
    items = [await _build_file_item(db, record) for record in records]
    return {"total": len(items), "items": items}


async def _import_into_event(
    db: AsyncSession,
    record: UniversityFileModel,
    upload: "_BytesUpload",
    event_id: int,
    admin: dict,
) -> Dict[str, Any]:
    records = await parse_file(upload)
    total = len(records)
    errors = await validate_records(records, event_id, db)
    record.rows_total = total

    if errors:
        record.status = "failed"
        await db.commit()
        return {
            "file": await _build_file_item(db, record),
            "import": None,
            "errors": errors,
        }

    counts = await upsert_records(records, event_id, db)
    record.rows_imported = counts["added"]
    record.rows_updated = counts["updated"]
    record.rows_skipped = counts["skipped"]
    record.status = "imported"

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "UPLOAD_UNIVERSITY_FILE",
        f"event_id={event_id}",
        f"Added {counts['added']}, Updated {counts['updated']} records",
        event_id=event_id,
    )
    await db.commit()
    await invalidate_uni_records_cache(event_id)

    return {
        "file": await _build_file_item(db, record),
        "import": {
            "total": total,
            "added": counts["added"],
            "updated": counts["updated"],
            "skipped": counts["skipped"],
            "error_count": 0,
        },
        "errors": [],
    }


async def upload_university_file(
    file, event_id: int | None, admin: dict, db: AsyncSession
) -> Dict[str, Any]:
    if event_id is not None:
        await _event_or_404(db, event_id)

    original_name = _safe_filename(getattr(file, "filename", "") or "file")
    if not original_name.lower().endswith(_ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="صيغة الملف غير مدعومة. المسموح: xlsx أو xls أو csv.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الملف فارغ أو لا يحتوي على بيانات.",
        )

    os.makedirs(STORAGE_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{original_name}"
    path = _storage_path(stored_name)
    with open(path, "wb") as handle:
        handle.write(raw)

    record = UniversityFileModel(
        event_id=event_id,
        original_name=original_name,
        stored_name=stored_name,
        storage_path=path,
        content_type=getattr(file, "content_type", None),
        size_bytes=len(raw),
        status="uploaded",
        uploaded_by=admin.get("admin_id"),
    )
    db.add(record)
    await db.flush()

    if event_id is None:
        await db.commit()
        return {"file": await _build_file_item(db, record), "import": None, "errors": []}

    upload = _BytesUpload(original_name, record.content_type, raw)
    return await _import_into_event(db, record, upload, event_id, admin)


async def link_university_file(
    file_id: int, event_id: int, admin: dict, db: AsyncSession
) -> Dict[str, Any]:
    record = await db.get(UniversityFileModel, file_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على الملف المحدد.",
        )
    await _event_or_404(db, event_id)

    record.event_id = event_id
    record.status = "uploaded"
    record.rows_imported = 0
    record.rows_updated = 0
    record.rows_skipped = 0
    await db.flush()

    path = record.storage_path
    if not (path and os.path.exists(path)):
        await db.commit()
        return {"file": await _build_file_item(db, record), "import": None, "errors": []}

    with open(path, "rb") as handle:
        raw = handle.read()
    upload = _BytesUpload(record.original_name, record.content_type, raw)
    return await _import_into_event(db, record, upload, event_id, admin)


async def delete_university_file(file_id: int, admin: dict, db: AsyncSession) -> Dict[str, Any]:
    record = await db.get(UniversityFileModel, file_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على الملف المحدد.",
        )
    path = record.storage_path
    original_name = record.original_name
    event_id = record.event_id
    await db.delete(record)
    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "DELETE_UNIVERSITY_FILE",
        f"file_id={file_id}",
        f"Deleted file {original_name}",
        event_id=event_id,
    )
    await db.commit()
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass
    if event_id is not None:
        await invalidate_uni_records_cache(event_id)
    return {"status": "success", "message": "تم حذف الملف."}
