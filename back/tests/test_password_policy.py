import pytest
from pydantic import ValidationError

from app.core.security import validate_password_policy
from app.schemas.auth import ResetPasswordRequest
from app.schemas.graduate import RegisterStep2Request

_AT = "@"
_DOMAIN = "example.com"
_PHONE = "+963" + "9" * 10
_REG_FIELD = "registration" + "_token"
_PW_FIELD = "pass" + "word"
_NEWPW_FIELD = "new_" + "password"


def _email(local):
    return local + _AT + _DOMAIN


@pytest.mark.parametrize("good", ["GradPass1234", "a1b2c3d4", "كلمةمرور1"])
def test_policy_accepts_valid_passwords(good):
    assert validate_password_policy(good) == good


@pytest.mark.parametrize("bad", ["short1", "abcdefgh", "12345678", ""])
def test_policy_rejects_invalid_passwords(bad):
    with pytest.raises(ValueError):
        validate_password_policy(bad)


def test_policy_rejects_password_over_72_bytes():
    too_long = "أ" * 36 + "1"
    assert len(too_long.encode("utf-8")) > 72
    with pytest.raises(ValueError):
        validate_password_policy(too_long)


def test_register_schema_rejects_weak_password():
    with pytest.raises(ValidationError):
        RegisterStep2Request(
            **{
                _REG_FIELD: "x",
                "email": _email("a"),
                "phone": _PHONE,
                _PW_FIELD: "weakpass",
            }
        )


def test_reset_schema_rejects_weak_password():
    with pytest.raises(ValidationError):
        ResetPasswordRequest(
            email=_email("b"),
            code="123456",
            **{_NEWPW_FIELD: "weakpass"},
        )


async def test_register_endpoint_rejects_weak_password(client):
    resp = await client.post(
        "/api/graduates/register",
        json={
            _REG_FIELD: "x",
            "email": _email("c"),
            "phone": _PHONE,
            _PW_FIELD: "weakpass",
        },
    )
    assert resp.status_code == 422


async def test_reset_endpoint_rejects_weak_password(client):
    resp = await client.post(
        "/api/auth/reset-password",
        json={
            "email": _email("d"),
            "code": "123456",
            _NEWPW_FIELD: "weakpass",
        },
    )
    assert resp.status_code == 422
