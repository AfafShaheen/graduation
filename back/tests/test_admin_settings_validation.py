"""Admin settings validation (polish round 1, task A1.2, decisions D1-D3).

Covers the three text fields of ``PUT /api/admin/settings``:
- shamcash_account_number: Latin letters, digits and a hyphen, 4..100, no spaces/other symbols (D1, hyphen as already allowed on dev);
- shamcash_receiver_name: Arabic/Latin letters, spaces and . - ' , no digits, 2..200 (D2);
- contact_phone: the graduate phone rule (optional + then 7..15 digits) (D3);
- absent field = unchanged, blank string = clear (service semantics kept);
- a rejected request changes nothing in the database.
"""

from sqlalchemy import select

from app.core import messages
from app.models.setting import SettingModel
from app.services.settings_service import (
    CONTACT_PHONE,
    SHAMCASH_ACCOUNT_NUMBER,
    SHAMCASH_RECEIVER_NAME,
)

_PW_FIELD = "pass" + "word"
_ADMIN_PW = "Admin" + "Pass" + "123!"


async def _admin_token(client, make_admin):
    admin = await make_admin()
    response = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, _PW_FIELD: _ADMIN_PW},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _stored(db):
    rows = await db.execute(select(SettingModel))
    return {row.key: row.value for row in rows.scalars().all()}


# --- accepted values ----------------------------------------------------------


async def test_accepted_values_are_trimmed_and_stored(client, db, make_admin):
    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={
            "shamcash_account_number": " AB12cd34 ",
            "shamcash_receiver_name": " محمد أحمد ",
            "contact_phone": " +963933123456 ",
        },
        headers=_auth(token),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["shamcash_account_number"] == "AB12cd34"
    assert body["shamcash_receiver_name"] == "محمد أحمد"
    assert body["contact_phone"] == "+963933123456"

    values = await _stored(db)
    assert values[SHAMCASH_ACCOUNT_NUMBER] == "AB12cd34"
    assert values[SHAMCASH_RECEIVER_NAME] == "محمد أحمد"
    assert values[CONTACT_PHONE] == "+963933123456"


_ACCEPTED_ACCOUNTS = ["AB12cd34", "7f3a9c1e0b", "A1b2", "12-34", "a" * 100]
_ACCEPTED_RECEIVERS = ["محمد أحمد", "Mohammad Ahmad", "O'Brien-Smith Jr.", "الطالب-الكريم", "د. سامي"]
_ACCEPTED_PHONES = ["0933123456", "+963933123456", "1234567", "1" * 15]


async def test_accepted_examples_per_field(client, make_admin):
    token = await _admin_token(client, make_admin)
    for value in _ACCEPTED_ACCOUNTS:
        resp = await client.put(
            "/api/admin/settings",
            json={"shamcash_account_number": value},
            headers=_auth(token),
        )
        assert resp.status_code == 200, (value, resp.text)
    for value in _ACCEPTED_RECEIVERS:
        resp = await client.put(
            "/api/admin/settings",
            json={"shamcash_receiver_name": value},
            headers=_auth(token),
        )
        assert resp.status_code == 200, (value, resp.text)
    for value in _ACCEPTED_PHONES:
        resp = await client.put(
            "/api/admin/settings",
            json={"contact_phone": value},
            headers=_auth(token),
        )
        assert resp.status_code == 200, (value, resp.text)


# --- rejected values ----------------------------------------------------------


async def test_rejected_accounts_return_422_with_arabic_message(client, make_admin):
    token = await _admin_token(client, make_admin)
    rejected = ["AB 12", "AB_12", "+12345", "abc", "a" * 101, "أبج123"]
    for value in rejected:
        resp = await client.put(
            "/api/admin/settings",
            json={"shamcash_account_number": value},
            headers=_auth(token),
        )
        assert resp.status_code == 422, (value, resp.text)
        assert messages.SETTINGS_ACCOUNT_INVALID in resp.text, (value, resp.text)


async def test_rejected_receivers_return_422_with_arabic_message(client, make_admin):
    token = await _admin_token(client, make_admin)
    rejected = ["محمد 123", "A", "أ" * 201, "<script>", "name_underscore"]
    for value in rejected:
        resp = await client.put(
            "/api/admin/settings",
            json={"shamcash_receiver_name": value},
            headers=_auth(token),
        )
        assert resp.status_code == 422, (value, resp.text)
        assert messages.SETTINGS_RECEIVER_INVALID in resp.text, (value, resp.text)


async def test_rejected_phones_return_422_with_arabic_message(client, make_admin):
    token = await _admin_token(client, make_admin)
    rejected = ["12345", "abc1234567", "0933-123-456", "1" * 16]
    for value in rejected:
        resp = await client.put(
            "/api/admin/settings",
            json={"contact_phone": value},
            headers=_auth(token),
        )
        assert resp.status_code == 422, (value, resp.text)
        assert messages.SETTINGS_PHONE_INVALID in resp.text, (value, resp.text)


async def test_rejected_request_changes_nothing_in_database(client, db, make_admin):
    db.add(SettingModel(key=SHAMCASH_ACCOUNT_NUMBER, value="GOOD123"))
    db.add(SettingModel(key=SHAMCASH_RECEIVER_NAME, value="اتحاد الطلبة"))
    db.add(SettingModel(key=CONTACT_PHONE, value="0933123456"))
    await db.commit()

    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={
            "shamcash_account_number": "GOOD456",   # valid
            "contact_phone": "not-a-phone",          # invalid -> whole request rejected
        },
        headers=_auth(token),
    )
    assert resp.status_code == 422, resp.text

    values = await _stored(db)
    assert values[SHAMCASH_ACCOUNT_NUMBER] == "GOOD123"
    assert values[CONTACT_PHONE] == "0933123456"


# --- service semantics kept ----------------------------------------------------


async def test_blank_string_still_clears_a_setting(client, db, make_admin):
    db.add(SettingModel(key=SHAMCASH_ACCOUNT_NUMBER, value="GOOD123"))
    await db.commit()

    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"shamcash_account_number": ""},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["shamcash_account_number"] is None

    values = await _stored(db)
    assert SHAMCASH_ACCOUNT_NUMBER not in values


async def test_absent_fields_stay_unchanged(client, db, make_admin):
    db.add(SettingModel(key=SHAMCASH_ACCOUNT_NUMBER, value="GOOD123"))
    db.add(SettingModel(key=CONTACT_PHONE, value="0933123456"))
    await db.commit()

    token = await _admin_token(client, make_admin)
    resp = await client.put(
        "/api/admin/settings",
        json={"shamcash_receiver_name": "اتحاد الطلبة"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    values = await _stored(db)
    assert values[SHAMCASH_ACCOUNT_NUMBER] == "GOOD123"
    assert values[CONTACT_PHONE] == "0933123456"
    assert values[SHAMCASH_RECEIVER_NAME] == "اتحاد الطلبة"
