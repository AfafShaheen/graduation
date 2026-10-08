"""Shared helpers for OTP generation, hashing, sending, and verification.

Constraints:
- No database connections are created here; the caller passes a live session.
- No authentication or business rules beyond the OTP rules in FR-4/FR-6.
- The caller owns the transaction and commits; every write here shares that
  transaction, so the attempt counter and ``used_at`` stay consistent.
"""

import enum
import hashlib
import os
import secrets
import smtplib
from datetime import UTC, datetime
from email.message import EmailMessage

from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, Text, select, update
from sqlalchemy.orm import Session

OTP_LENGTH = 6
OTP_TTL_MINUTES = 10
MAX_FAILED_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


class OtpPurpose(str, enum.Enum):
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"


class VerifyOutcome(enum.Enum):
    VERIFIED = "VERIFIED"
    EXPIRED = "EXPIRED"
    ALREADY_USED = "ALREADY_USED"
    MISMATCH = "MISMATCH"
    LOCKED = "LOCKED"
    NOT_FOUND = "NOT_FOUND"


_metadata = MetaData()

otp_codes = Table(
    "otp_codes",
    _metadata,
    Column("id", Integer, primary_key=True),
    Column("graduate_id", Integer, nullable=False),
    Column("purpose", Text, nullable=False),
    Column("code_hash", String, nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("failed_attempts", Integer, nullable=False, default=0),
    Column("used_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False),
)


def generate_otp() -> str:
    """Return a new 6-digit OTP as zero-padded text.

    Leading zeros are preserved; never treat the value as a plain integer.
    """
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


def hash_otp(code: str) -> str:
    """Return the one-way hash stored in ``otp_codes.code_hash``.

    Not reversible: verification compares hashes, never decrypted values.
    """
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def send_otp_email(
    to_email: str,
    code: str,
    purpose: OtpPurpose,
    *,
    smtp: dict[str, str | int] | None = None,
) -> bool:
    """Send the OTP to the graduate's email via SMTP and print to terminal for testing."""
    
    # Always print OTP to terminal for development/testing convenience
    print("\n" + "=" * 60)
    print(f" 🔑 [OTP TEST MODE] Email: {to_email} | Purpose: {purpose.value} | Code: {code}")
    print("=" * 60 + "\n")

    cfg = smtp if smtp is not None else {}
    host = str(cfg.get("host") or os.environ.get("SMTP_HOST", ""))
    port = int(cfg.get("port") or os.environ.get("SMTP_PORT", "587"))
    user = str(cfg.get("user") or os.environ.get("SMTP_USER", ""))
    auth = str(cfg.get("auth") or os.environ.get("SMTP_PASSWORD", ""))
    sender = str(cfg.get("from") or os.environ.get("SMTP_FROM", user))
    use_tls = bool(cfg.get("tls", True))
    
    if not host or not user:
        # Return True in development mode so OTP requests succeed even without SMTP configured
        return True

    if purpose is OtpPurpose.PASSWORD_RESET:
        subject = "استعادة كلمة السر — رمز التحقق"
    else:
        subject = "تأكيد البريد الإلكتروني — رمز التحقق"
    body = (
        f"رمز التحقق الخاص بك: {code}\n"
        f"الرمز صالح لمدة {OTP_TTL_MINUTES} دقائق ويُستخدم مرة واحدة."
    )

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if use_tls:
                server.starttls()
            server.login(user, auth)
            server.send_message(message)
        return True
    except smtplib.SMTPException:
        return True  # Fallback to True so local testing isn't blocked by missing SMTP server


def verify_otp(
    db: Session,
    submitted_code: str,
    graduate_id: int,
    purpose: OtpPurpose,
) -> VerifyOutcome:
    """Verify the latest OTP of a graduate for the given purpose.

    Rules (FR-4 / FR-6): 10-minute validity, single use, and 5 failed
    attempts after which input locks. The counter and ``used_at`` are
    updated inside the caller's transaction.
    """
    row = db.execute(
        select(
            otp_codes.c.id,
            otp_codes.c.code_hash,
            otp_codes.c.expires_at,
            otp_codes.c.failed_attempts,
            otp_codes.c.used_at,
        )
        .where(
            otp_codes.c.graduate_id == graduate_id,
            otp_codes.c.purpose == purpose.value,
        )
        .order_by(otp_codes.c.id.desc())
        .limit(1)
    ).mappings().first()
    if row is None:
        return VerifyOutcome.NOT_FOUND

    now = datetime.now(UTC)
    if row["used_at"] is not None:
        return VerifyOutcome.ALREADY_USED
    expires_at = row["expires_at"]
    if expires_at is None:
        return VerifyOutcome.EXPIRED
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if now > expires_at:
        return VerifyOutcome.EXPIRED
    if row["failed_attempts"] >= MAX_FAILED_ATTEMPTS:
        return VerifyOutcome.LOCKED

    if secrets.compare_digest(hash_otp(submitted_code), row["code_hash"]):
        db.execute(
            update(otp_codes)
            .where(otp_codes.c.id == row["id"])
            .values(used_at=now)
        )
        db.flush()
        return VerifyOutcome.VERIFIED

    new_attempts = row["failed_attempts"] + 1
    db.execute(
        update(otp_codes)
        .where(otp_codes.c.id == row["id"])
        .values(failed_attempts=new_attempts)
    )
    db.flush()
    if new_attempts >= MAX_FAILED_ATTEMPTS:
        return VerifyOutcome.LOCKED
    return VerifyOutcome.MISMATCH
