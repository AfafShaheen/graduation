import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
from jose import jwt

from app.core import messages

_jwt_key = os.getenv("JWT_SECRET_KEY")
if _jwt_key is None or not _jwt_key.strip() or len(_jwt_key.strip()) < 32:
    raise RuntimeError(
        "JWT_SECRET_KEY is missing or too short (need at least 32 characters). "
        "Set it in the environment before starting the backend."
    )
secret_key = _jwt_key.strip()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120
EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES = 30


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)


def create_verification_token(graduate_id: int) -> str:
    """Create a short-lived token that proves ownership of a graduate account
    during email verification (SRS FR-4). It carries purpose='email_verification'
    so it is rejected by the access-token and registration-token dependencies.
    """
    data = {"sub": str(graduate_id), "purpose": "email_verification"}
    return create_access_token(
        data, expires_delta=timedelta(minutes=EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES)
    )


def validate_password_policy(value: str) -> str:
    """Enforce the shared password policy (SRS FR-1, D4).

    Requires at least 8 characters, at least one letter, at least one digit,
    and at most 72 UTF-8 bytes (bcrypt's effective limit).
    """
    has_letter = any(ch.isalpha() for ch in value)
    has_digit = any(ch.isdigit() for ch in value)
    if len(value) < 8 or not has_letter or not has_digit:
        raise ValueError(messages.PASSWORD_POLICY)
    if len(value.encode("utf-8")) > 72:
        raise ValueError(messages.PASSWORD_POLICY)
    return value
