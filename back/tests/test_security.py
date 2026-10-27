"""Tests for the JWT secret configuration and token purpose separation (item 0.2)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

_BACK_DIR = Path(__file__).resolve().parents[1]
_KEY_NAME = "JWT_SECRET" + "_KEY"


def _run_security_import(**env_overrides):
    env = dict(os.environ)
    for name, value in env_overrides.items():
        if value is None:
            env.pop(name, None)
        else:
            env[name] = value
    return subprocess.run(
        [sys.executable, "-c", "import app.core.security"],
        cwd=str(_BACK_DIR),
        env=env,
        capture_output=True,
        text=True,
    )


def test_import_without_key_fails():
    result = _run_security_import(**{_KEY_NAME: None})
    assert result.returncode != 0
    assert _KEY_NAME in (result.stderr + result.stdout)


def test_import_with_short_key_fails():
    result = _run_security_import(**{_KEY_NAME: "too-short"})
    assert result.returncode != 0
    assert _KEY_NAME in (result.stderr + result.stdout)


def test_import_with_blank_key_fails():
    result = _run_security_import(**{_KEY_NAME: "   "})
    assert result.returncode != 0


def test_access_token_rejected_by_registration_decoder():
    from app.core.security import create_access_token
    from app.services.graduate_service import decode_registration_token

    encoded = create_access_token({"sub": "1", "role": "graduate"})
    with pytest.raises(HTTPException) as exc:
        decode_registration_token(encoded)
    assert exc.value.status_code == 401


async def test_registration_token_rejected_by_graduate_dependency(db):
    from fastapi.security import HTTPAuthorizationCredentials

    from app.core.deps import get_current_graduate
    from app.services.graduate_service import create_registration_token

    encoded = create_registration_token({"university_id": "1", "college_id": 1})
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=encoded)
    with pytest.raises(HTTPException) as exc:
        await get_current_graduate(credentials, db)
    assert exc.value.status_code == 403
