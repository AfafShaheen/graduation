"""Registered graduates whose "top student" status may have come from the GPA ranking.

Before the fix, an empty cell in the "حالة الطالب من الأوائل" column made the site rank the
student by GPA, so someone the file did not list could be asked to register as a top student.
Re-uploading the file corrects every student who has NOT registered yet, but a registered
graduate keeps the record he was verified against.

This prints (read-only) the graduates who hold a top rank while the stored file value is
empty or "not top": compare them with the Affairs file and fix them by hand if needed.

    docker compose exec back python -m scripts.check_top_ranks
"""
import asyncio

from sqlalchemy import or_, select

from app.core.database import AsyncSessionLocal
from app.models.graduate import GraduateModel
from app.models.university_record import UniversityRecordModel


async def main() -> None:
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(GraduateModel, UniversityRecordModel)
                .join(UniversityRecordModel, UniversityRecordModel.university_id == GraduateModel.university_id)
                .where(
                    GraduateModel.top_rank.is_not(None),
                    or_(
                        UniversityRecordModel.top_rank_from_file.is_(None),
                        UniversityRecordModel.top_rank_from_file == 0,
                    ),
                )
                .order_by(GraduateModel.university_id)
            )
        ).all()

    if not rows:
        print("No registered graduate needs checking.")
        return
    print(f"{len(rows)} graduate(s) hold a top rank without the file naming them:")
    print("university_id | name | top_rank | file value (None = empty, 0 = not top) | gpa")
    for graduate, record in rows:
        name = getattr(graduate, "full_name", None) or getattr(record, "full_name", "")
        print(f"{graduate.university_id} | {name} | {graduate.top_rank} | {record.top_rank_from_file} | {graduate.gpa}")


if __name__ == "__main__":
    asyncio.run(main())
