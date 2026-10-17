from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.major import MajorModel
from app.models.college import CollegeModel
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel
from app.schemas.major import MajorCreate, MajorUpdate
from app.services.audit_log import ActorType, record_audit
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

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "CREATE_MAJOR",
        f"Major ID {new_major.id}",
        f"Created major '{new_major.name}' for college ID {college_id}",
        event_id=college.event_id,
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

    college = await db.get(CollegeModel, major.college_id)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "UPDATE_MAJOR",
        f"Major ID {major_id}",
        f"Renamed major from '{old_name}' to '{major.name}'",
        event_id=college.event_id if college else None,
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

    college = await db.get(CollegeModel, major.college_id)

    await db.delete(major)

    await record_audit(
        db,
        ActorType.ADMIN,
        admin["admin_id"],
        "DELETE_MAJOR",
        f"Major ID {major_id}",
        f"Deleted major '{major.name}'",
        event_id=college.event_id if college else None,
    )

    await db.commit()
    await invalidate_majors_cache()
    return {"status": "success", "message": "تم حذف التخصص بنجاح."}
