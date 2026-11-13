import json
import logging
import os
import uuid
from typing import Any, Dict

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import EventModel
from app.models.graduate import GraduateModel
from app.models.university_file import UniversityFileModel
from app.models.university_record import UniversityRecordModel
from app.services.audit_log import ActorType, record_audit
from app.services.university_records_service import (
    invalidate_uni_records_cache,
    parse_file,
    read_upload_limited,
    upsert_records,
    validate_records,
)

STORAGE_DIR = os.getenv("UNIVERSITY_FILES_DIR", "/app/storage/university_files")

_ALLOWED_EXTENSIONS = (".xlsx", ".csv")

logger = logging.getLogger(__name__)


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "").strip() or "file"
    return base.replace("\x00", "")


def _storage_path(stored_name: str) -> str:
    return os.path.join(STORAGE_DIR, stored_name)


def _remove_stored_file(path: str | None) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        logger.warning("Failed to remove university file from disk", exc_info=True)


class _BytesUpload:
    """غلاف بسيط يقلّد UploadFile ليمرَّر إلى parse_file المحلي."""

    def __init__(self, filename: str, content_type: str | None, data: bytes):
        self.filename = filename
        self.content_type = content_type
        self._data = data
        self._pos = 0

    async def read(self, size: int = -1) -> bytes:
        end = len(self._data) if size is None or size < 0 else self._pos + size
        chunk = self._data[self._pos:end]
        self._pos += len(chunk)
        return chunk

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


# how many errors of a failed import are kept with the file, and how many the list shows
_KEPT_ERRORS = 200
_SHOWN_ERRORS = 50


async def _build_file_item(db: AsyncSession, record: UniversityFileModel) -> Dict[str, Any]:
    rows = (
        await db.execute(
            select(
                UniversityRecordModel.college_id,
                func.count(UniversityRecordModel.id),
            )
            .where(UniversityRecordModel.file_id == record.id)
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

    errors: list = []
    if record.status == "failed" and record.errors_json:
        try:
            errors = json.loads(record.errors_json)[:_SHOWN_ERRORS]
        except ValueError:
            errors = []

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
        "rows_skipped_registered": record.rows_skipped_registered,
        "error_count": record.error_count,
        "errors": errors,
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
    previous_event_id: int | None = None,
    discard_file_on_failure: bool = False,
) -> Dict[str, Any]:
    records = await parse_file(upload)
    total = len(records)
    errors = await validate_records(records, event_id, db)
    record.rows_total = total

    if errors:
        record.status = "failed"
        record.error_count = len(errors)
        record.errors_json = json.dumps(errors[:_KEPT_ERRORS], ensure_ascii=False)
        record.rows_imported = record.rows_updated = record.rows_skipped = record.rows_skipped_registered = 0
        await db.commit()
        if discard_file_on_failure:
            # A fresh upload that failed validation is not kept on disk; the
            # "failed" row stays in the database for the admin to review.
            _remove_stored_file(record.storage_path)
        return {
            "file": await _build_file_item(db, record),
            "import": None,
            "errors": errors,
            "status": "failed",
        }

    if previous_event_id is not None and previous_event_id != event_id:
        # records of graduates who already registered stay: they are part of the roster
        await db.execute(
            delete(UniversityRecordModel).where(
                UniversityRecordModel.file_id == record.id,
                UniversityRecordModel.event_id == previous_event_id,
                UniversityRecordModel.university_id.not_in(select(GraduateModel.university_id)),
            )
        )

    counts = await upsert_records(records, event_id, db, file_id=record.id)
    record.rows_imported = counts["added"]
    record.rows_updated = counts["updated"]
    record.rows_skipped = counts["skipped"]
    record.rows_skipped_registered = counts["skipped_registered"]
    record.error_count = 0
    record.errors_json = None
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
    if previous_event_id is not None and previous_event_id != event_id:
        await invalidate_uni_records_cache(previous_event_id)

    return {
        "file": await _build_file_item(db, record),
        "import": {
            "total": total,
            "added": counts["added"],
            "updated": counts["updated"],
            "skipped": counts["skipped"],
            "skipped_registered": counts["skipped_registered"],
            "error_count": 0,
        },
        "errors": [],
        "status": "imported",
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
            detail="صيغة الملف غير مدعومة. المسموح: xlsx أو csv.",
        )

    raw = await read_upload_limited(file)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الملف فارغ أو لا يحتوي على بيانات.",
        )

    os.makedirs(STORAGE_DIR, exist_ok=True)
    # ASCII-only name on disk: the server's Python may use an ASCII filesystem
    # encoding, so Arabic file names crash open(). original_name stays in the DB.
    stored_name = f"{uuid.uuid4().hex}{os.path.splitext(original_name)[1].lower()}"
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
        return {"file": await _build_file_item(db, record), "import": None, "errors": [], "status": "uploaded"}

    upload = _BytesUpload(original_name, record.content_type, raw)
    try:
        return await _import_into_event(
            db, record, upload, event_id, admin, discard_file_on_failure=True
        )
    except BaseException:
        # The request rolls back, so no row will point at this file: drop it.
        _remove_stored_file(path)
        raise


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

    previous_event_id = record.event_id
    record.event_id = event_id
    record.status = "uploaded"
    record.rows_imported = 0
    record.rows_updated = 0
    record.rows_skipped = 0
    record.rows_skipped_registered = 0
    record.error_count = 0
    record.errors_json = None
    await db.flush()

    path = record.storage_path
    if not (path and os.path.exists(path)):
        await db.commit()
        return {"file": await _build_file_item(db, record), "import": None, "errors": [], "status": "uploaded"}

    with open(path, "rb") as handle:
        raw = handle.read()
    upload = _BytesUpload(record.original_name, record.content_type, raw)
    return await _import_into_event(
        db, record, upload, event_id, admin, previous_event_id=previous_event_id
    )


async def delete_university_file(
    file_id: int,
    admin: dict,
    db: AsyncSession,
    delete_records: bool = False,
) -> Dict[str, Any]:
    record = await db.get(UniversityFileModel, file_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لم يتم العثور على الملف المحدد.",
        )
    path = record.storage_path
    original_name = record.original_name
    event_id = record.event_id
    deleted_records = 0
    kept_registered = 0
    if delete_records:
        # a graduate who already registered keeps his record (the roster, the ticket and the
        # statistics are built on it); only the records nobody registered from are removed
        registered_ids = select(GraduateModel.university_id)
        kept_registered = (
            await db.scalar(
                select(func.count(UniversityRecordModel.id)).where(
                    UniversityRecordModel.file_id == record.id,
                    UniversityRecordModel.university_id.in_(registered_ids),
                )
            )
        ) or 0
        result = await db.execute(
            delete(UniversityRecordModel).where(
                UniversityRecordModel.file_id == record.id,
                UniversityRecordModel.university_id.not_in(registered_ids),
            )
        )
        deleted_records = result.rowcount or 0
    await db.delete(record)
    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "DELETE_UNIVERSITY_FILE",
        f"file_id={file_id}",
        f"Deleted file {original_name}; deleted_records={deleted_records}; kept_registered={kept_registered}",
        event_id=event_id,
    )
    await db.commit()
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        logger.warning(
            "Failed to remove university file from disk after database deletion",
            extra={"file_id": file_id},
            exc_info=True,
        )
    if event_id is not None:
        await invalidate_uni_records_cache(event_id)
    return {
        "status": "success",
        "message": (
            "تم حذف الملف والسجلات المستوردة منه."
            + (
                f" وأُبقي {kept_registered} سجل لخريجين سجّلوا بالفعل."
                if kept_registered
                else ""
            )
            if delete_records
            else "تم حذف الملف مع إبقاء السجلات المستوردة."
        ),
        "deleted_records": deleted_records,
        "kept_registered": kept_registered,
    }
