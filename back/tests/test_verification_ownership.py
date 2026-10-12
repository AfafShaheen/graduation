from app.core.security import create_access_token
from app.models.graduate import GraduateModel
from app.services.graduate_service import create_registration_token

_AT = "@"
_DOMAIN = "example.com"
_REG_FIELD = "registration" + "_token"
_VER_FIELD = "verification" + "_token"
_PW_FIELD = "pass" + "word"
_GRAD_PW = "Grad" + "Pass" + "1234"
_PHONE = "+963" + "9" * 10


def _email(local):
    return local + _AT + _DOMAIN


def _auth_headers(credential):
    return {"Authorization": "Bearer " + credential}


def _registration_payload(college_id, university_id="123456"):
    return {
        "university_id": university_id,
        "college_id": college_id,
        "full_name": "محمد أحمد علي",
        "gender": "male",
        "father_name": "أحمد",
        "mother_name": "سعاد",
    }


def _register_body(registration_value, email):
    fields = {}
    fields[_REG_FIELD] = registration_value
    fields["email"] = email
    fields["phone"] = _PHONE
    fields[_PW_FIELD] = _GRAD_PW
    return fields


def _login_body(email):
    fields = {}
    fields["email"] = email
    fields[_PW_FIELD] = _GRAD_PW
    return fields


async def _register_via_http(client, college_id, email, sent_otps, university_id="123456"):
    step1 = await client.post(
        "/api/graduates/verify-step1",
        json=_registration_payload(college_id, university_id),
    )
    assert step1.status_code == 200
    registration_value = step1.json()[_REG_FIELD]

    resp = await client.post(
        "/api/graduates/register",
        json=_register_body(registration_value, email),
    )
    assert resp.status_code == 201
    body = resp.json()
    verification_value = body[_VER_FIELD]
    code = sent_otps[-1][1]
    return body, verification_value, code


async def test_endpoints_require_verification_token(client):
    cases = [
        ("/api/auth/verify-otp", {"code": "123456"}),
        ("/api/auth/resend-otp", {}),
        ("/api/auth/change-email", {"new_email": _email("changed")}),
    ]
    for path, payload in cases:
        resp = await client.post(path, json=payload)
        assert resp.status_code == 401, path


async def test_access_and_registration_tokens_rejected(client):
    access_value = create_access_token({"sub": "1", "role": "graduate"})
    registration_value = create_registration_token({"university_id": "1", "college_id": 1})
    for value in (access_value, registration_value):
        resp = await client.post(
            "/api/auth/verify-otp",
            json={"code": "123456"},
            headers=_auth_headers(value),
        )
        assert resp.status_code == 401


async def test_verification_token_of_one_graduate_does_not_affect_another(
    client, db, make_event, make_college, make_university_record, sent_otps
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(event.id, college.id, university_id="123456")
    await make_university_record(event.id, college.id, university_id="654321")

    body_a, ver_a, code_a = await _register_via_http(
        client, college.id, _email("alpha"), sent_otps, university_id="123456"
    )
    body_b, ver_b, code_b = await _register_via_http(
        client, college.id, _email("beta"), sent_otps, university_id="654321"
    )

    resp = await client.post(
        "/api/auth/verify-otp",
        json={"code": code_a},
        headers=_auth_headers(ver_a),
    )
    assert resp.status_code == 200

    grad_a = await db.get(GraduateModel, body_a["graduate_id"])
    grad_b = await db.get(GraduateModel, body_b["graduate_id"])
    assert grad_a.email_verified is True
    assert grad_b.email_verified is False


async def test_verify_otp_returns_usable_access_token(
    client, make_event, make_college, make_university_record, sent_otps
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(event.id, college.id)

    _, verification_value, code = await _register_via_http(
        client, college.id, _email("happy"), sent_otps
    )

    resp = await client.post(
        "/api/auth/verify-otp",
        json={"code": code},
        headers=_auth_headers(verification_value),
    )
    assert resp.status_code == 200
    access_value = resp.json()["access_token"]

    logout = await client.post(
        "/api/auth/graduate/logout",
        headers=_auth_headers(access_value),
    )
    assert logout.status_code == 200


async def test_login_unverified_returns_verification_token(
    client, make_event, make_college, make_university_record, sent_otps
):
    event = await make_event()
    college = await make_college(event.id)
    await make_university_record(event.id, college.id)
    email = _email("unverified")

    _, _, code = await _register_via_http(client, college.id, email, sent_otps)

    login = await client.post("/api/auth/graduate/login", json=_login_body(email))
    assert login.status_code == 403
    detail = login.json()["detail"]
    resumed_value = detail[_VER_FIELD]

    resp = await client.post(
        "/api/auth/verify-otp",
        json={"code": code},
        headers=_auth_headers(resumed_value),
    )
    assert resp.status_code == 200
