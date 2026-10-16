from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct
from app.models.university_record import UniversityRecordModel


async def compute_top_rank(db: AsyncSession, record: UniversityRecordModel) -> int | None:
    """Compute dense rank over gpa DESC within the scope of (event_id, college_id, major_id).

    - Scope: same event_id, college_id, and major_id (using is_not_distinct_from to handle NULL major_id correctly).
    - Ignores records whose gpa is NULL.
    - Uses dense ranking: if two students share the highest GPA, both are rank 1, and the next distinct GPA is rank 2.
    - Returns 1, 2, or 3 if dense rank <= 3, otherwise None.
    """
    if record.gpa is None:
        return None

    # Dense rank = count of distinct GPAs strictly greater than this record's GPA + 1
    stmt = select(func.count(distinct(UniversityRecordModel.gpa))).where(
        UniversityRecordModel.event_id == record.event_id,
        UniversityRecordModel.college_id == record.college_id,
        UniversityRecordModel.major_id.is_not_distinct_from(record.major_id),
        UniversityRecordModel.gpa.is_not(None),
        UniversityRecordModel.gpa > record.gpa
    )
    result = await db.execute(stmt)
    higher_distinct_count = result.scalar() or 0
    rank = higher_distinct_count + 1

    if rank <= 3:
        return rank
    return None
