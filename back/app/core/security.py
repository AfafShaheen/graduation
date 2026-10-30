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
REFRESH_TOKEN_TYPE = "refresh"
ADMIN_REFRESH_TOKEN_EXPIRE_DAYS = 30
SCANNER_REFRESH_TOKEN_EXPIRE_DAYS = 1  # the scanner session lasts 24 hours
GRADUATE_REFRESH_TOKEN_EXPIRE_DAYS = 7
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


def _refresh_expiry(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def create_refresh_token(data: dict, days: int, family_exp: Optional[int] = None) -> str:
    """Create a long-lived refresh token (P8).

    ``family_exp`` (epoch seconds) is the absolute end of the whole session: the
    first token of a login sets it to ``now + days`` and every rotated token
    inherits it, so rotating never extends a session beyond its original limit
    (scanner 24 hours, graduate 7 days, admin 30 days from the login).

    The token carries ``type='refresh'`` so access-token and registration-token
    dependencies reject it, plus a fresh ``jti`` that is stored in Redis for
    rotation and reuse detection. ``family`` groups every refresh token derived
    from the same login so that a detected reuse can revoke the whole chain.
    """
    to_encode = data.copy()
    natural = _refresh_expiry(days)
    cap = int(family_exp) if family_exp is not None else int(natural.timestamp())
    expiry = natural if cap >= int(natural.timestamp()) else datetime.fromtimestamp(cap, timezone.utc)
    to_encode.update(
        {
            "exp": expiry,
            "fexp": cap,
            "jti": str(uuid.uuid4()),
            "type": REFRESH_TOKEN_TYPE,
        }
    )
    return jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)


def refresh_expires_in(days: int, family_exp: Optional[int] = None) -> int:
    """Seconds a freshly issued refresh token lives (capped by the session end)."""
    full = days * 86400
    if family_exp is None:
        return full
    remaining = int(family_exp - datetime.now(timezone.utc).timestamp())
    return max(1, min(full, remaining))


def decode_token(token: str) -> dict:
    """Decode a JWT without enforcing a specific type (P8 helper).

    Signature/expiry are validated; callers check ``role``/``type``/``purpose``.
    """
    return jwt.decode(token, secret_key, algorithms=[ALGORITHM])


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
