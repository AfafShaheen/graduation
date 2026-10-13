"""Step-1 verification must normalise the gender field (SRS FR-2).

The university record stores the value as it appears in the source file while
the graduate types it by hand, so the two sides can differ only by Arabic
orthography (e.g. "أنثى" vs "انثى"). Both sides are passed through
``normalize_arabic`` before comparison.
"""


def _payload(college_id, university_id, gender):
    return {
        "university_id": university_id,
        "college_id": college_id,
        "full_name": "محمد أحمد علي",
        "gender": gender,
        "father_name": "أحمد",
        "mother_name": "سعاد",
    }


async def test_gender_matches_after_arabic_normalization(
    client, make_event, make_college, make_university_record
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(
        event.id, college.id, university_id="700001", gender="أنثى"
    )

    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_payload(college.id, "700001", "انثى"),
    )

    assert resp.status_code == 200
    assert resp.json()["valid"] is True


async def test_gender_mismatch_is_still_rejected(
    client, make_event, make_college, make_university_record
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(
        event.id, college.id, university_id="700002", gender="أنثى"
    )

    resp = await client.post(
        "/api/graduates/verify-step1",
        json=_payload(college.id, "700002", "ذكر"),
    )

    assert resp.status_code == 400
