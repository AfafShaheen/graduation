"""D9: the database uniqueness rules are unchanged by PART A.

Adding the identity columns (first_name/last_name) must NOT introduce a
composite UNIQUE over the identity fields. The only uniques remain:

* ``university_records``: (event_id, university_id)
* ``graduates``: (college_id, university_id), plus the unique email/code.

These tests pin that behaviour so a future change cannot silently add or drop a
uniqueness rule. Graduate emails are left to the factory default (derived from
the university id) so distinct rows stay distinct.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.university_record import UniversityRecordModel


async def test_university_records_unique_per_event(db, make_event, make_college):
    event = await make_event()
    college = await make_college(event.id)

    db.add(
        UniversityRecordModel(
            event_id=event.id, college_id=college.id, university_id="500001",
            full_name="محمد أحمد", father_name="خالد", mother_name="سعاد",
            gender="ذكر",
        )
    )
    await db.commit()

    db.add(
        UniversityRecordModel(
            event_id=event.id, college_id=college.id, university_id="500001",
            full_name="اسم آخر", father_name="آخر", mother_name="أخرى",
            gender="أنثى",
        )
    )
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()


async def test_same_names_different_ids_allowed_in_records(
    db, make_event, make_college
):
    event = await make_event()
    college = await make_college(event.id)

    db.add(
        UniversityRecordModel(
            event_id=event.id, college_id=college.id, university_id="500002",
            full_name="محمد أحمد", father_name="خالد", mother_name="سعاد",
            gender="ذكر",
        )
    )
    db.add(
        UniversityRecordModel(
            event_id=event.id, college_id=college.id, university_id="500003",
            full_name="محمد أحمد", father_name="خالد", mother_name="سعاد",
            gender="ذكر",
        )
    )
    await db.commit()

    result = await db.execute(select(UniversityRecordModel.university_id))
    ids = {row[0] for row in result.all()}
    assert {"500002", "500003"}.issubset(ids)


async def test_graduate_unique_per_college_university(
    db, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)
    await make_graduate(college.id, university_id="500020")

    with pytest.raises(IntegrityError):
        await make_graduate(college.id, university_id="500020")
    await db.rollback()


async def test_same_identity_fields_different_ids_allowed_in_graduates(
    db, make_event, make_college, make_graduate
):
    event = await make_event()
    college = await make_college(event.id)

    g1 = await make_graduate(
        college.id, university_id="500010",
        full_name="محمد أحمد", father_name="خالد", mother_name="سعاد",
    )
    g2 = await make_graduate(
        college.id, university_id="500011",
        full_name="محمد أحمد", father_name="خالد", mother_name="سعاد",
    )
    assert g1.id != g2.id
