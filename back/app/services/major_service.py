from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.major import MajorModel
from app.models.college import CollegeModel
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from app.models.audit_log import AuditLogModel
from app.schemas.major import MajorCreate, MajorUpdate
from app.services.graduate_service import normalize_arabic
from app.core.redis import redis_client


async def invalidate_majors_cache() -> None:
    try:
        await redis_client.delete("public:registration:colleges")
        keys = await redis_client.keys("events:*")
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass


async def write_audit_log(db: AsyncSession, admin_id: int, action: str, target: str, details: str) -> None:
    log_entry = AuditLogModel(
        actor_type="ADMIN",
        actor_id=admin_id,
        action=action,
        target=target,
        details=details
    )
    db.add(log_entry)


async def list_college_majors_service(db: AsyncSession, college_id: int) -> list[MajorModel]:
    college = await db.get(CollegeModel, college_id)
    if not college:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الكلية.")
    stmt = select(MajorModel).where(MajorModel.college_id == college_id).order_by(MajorModel.name)
    result = await db.execute(stmt)
    return result.scalars().all()


async def create_major_service(db: AsyncSession, college_id: int, data: MajorCreate, admin: dict) -> MajorModel:
    college = await db.get(CollegeModel, college_id)
    if not college:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على الكلية.")

    normalized_name = normalize_arabic(data.name)

    # Check duplicate major name under the same college using normalized check
    existing_res = await db.execute(select(MajorModel).where(MajorModel.college_id == college_id))
    existing_majors = existing_res.scalars().all()
    for em in existing_majors:
        if normalize_arabic(em.name) == normalized_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="التخصص موجود مسبقاً في هذه الكلية."
            )

    new_major = MajorModel(name=data.name.strip(), college_id=college_id)
    db.add(new_major)
    await db.flush()
    await db.refresh(new_major)

    await write_audit_log(
        db,
        admin_id=admin["admin_id"],
        action="CREATE_MAJOR",
        target=f"Major ID {new_major.id}",
        details=f"Created major '{new_major.name}' for college ID {college_id}"
    )

    await db.commit()
    await invalidate_majors_cache()
    return new_major


async def update_major_service(db: AsyncSession, major_id: int, data: MajorUpdate, admin: dict) -> MajorModel:
    major = await db.get(MajorModel, major_id)
    if not major:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على التخصص.")

    normalized_name = normalize_arabic(data.name)

    # Check duplicate
    existing_res = await db.execute(select(MajorModel).where(MajorModel.college_id == major.college_id, MajorModel.id != major_id))
    existing_majors = existing_res.scalars().all()
    for em in existing_majors:
        if normalize_arabic(em.name) == normalized_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="التخصص موجود مسبقاً في هذه الكلية."
            )

    old_name = major.name
    major.name = data.name.strip()
    db.add(major)

    await write_audit_log(
        db,
        admin_id=admin["admin_id"],
        action="UPDATE_MAJOR",
        target=f"Major ID {major_id}",
        details=f"Renamed major from '{old_name}' to '{major.name}'"
    )

    await db.commit()
    await invalidate_majors_cache()
    return major


async def delete_major_service(db: AsyncSession, major_id: int, admin: dict) -> dict:
    major = await db.get(MajorModel, major_id)
    if not major:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لم يتم العثور على التخصص.")

    # Check if any graduate or university record references this major
    grad_res = await db.execute(select(GraduateModel).where(GraduateModel.major_id == major_id))
    if grad_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن حذف التخصص لأنه مرتبط بخريجين مسجلين."
        )

    uni_res = await db.execute(select(UniversityRecordModel).where(UniversityRecordModel.major_id == major_id))
    if uni_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن حذف التخصص لأنه مرتبط بسجلات جامعية."
        )

    await db.delete(major)

    await write_audit_log(
        db,
        admin_id=admin["admin_id"],
        action="DELETE_MAJOR",
        target=f"Major ID {major_id}",
        details=f"Deleted major '{major.name}'"
    )

    await db.commit()
    await invalidate_majors_cache()
    return {"status": "success", "message": "تم حذف التخصص بنجاح."}
