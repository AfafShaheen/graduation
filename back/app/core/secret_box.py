"""A small reversible box for secrets that an admin must be able to read back (scanner passwords).

Login never uses this: it checks the bcrypt hash. This copy exists only so the admin can show a
volunteer his password at the gate. It is encrypted (Fernet) with a key derived from the application
secret, so a copy of the database alone does not give the passwords; if that secret is ever changed
the stored copies become unreadable and each scanner just needs a password reset.
"""
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.core.security import secret_key

logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    digest = hashlib.sha256(("scanner-password-box:" + secret_key).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_text(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_text(token: str | None) -> str | None:
    """The text back, or None when there is no copy or it cannot be read."""
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.warning("A stored scanner password could not be decrypted")
        return None
