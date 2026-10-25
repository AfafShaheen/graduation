"""Shared helpers for OTP generation, hashing, sending, and verification.

Constraints:
- No database connections are created here; the caller passes a live session.
- No authentication or business rules beyond the OTP rules in FR-4/FR-6.
- The caller owns the transaction and commits; every write here shares that
  transaction, so the attempt counter and ``used_at`` stay consistent.
"""

import enum
import hashlib
import html
import logging
import os
import secrets
import smtplib
from datetime import UTC, datetime
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr

from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, Text, select, update
from sqlalchemy.orm import Session

OTP_LENGTH = 6
OTP_TTL_MINUTES = 10
MAX_FAILED_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
FROM_DISPLAY_NAME = "اتحاد الطلبة - حفل التخرج"

logger = logging.getLogger(__name__)


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


class SendOutcome(str, enum.Enum):
    """Why an OTP email was (not) delivered.

    SENT: a real SMTP transaction completed.
    DEV_LOGGED: SMTP is not configured and APP_ENV is development/test, so the
        code was only logged. Never a real delivery — surfaced so a
        misconfigured server cannot masquerade as a working one.
    NOT_CONFIGURED: SMTP is not configured in a non-development environment.
    FAILED: SMTP is configured but the transaction raised.
    """

    SENT = "SENT"
    DEV_LOGGED = "DEV_LOGGED"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    FAILED = "FAILED"


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


def _address_part(value: str) -> str:
    """Return the bare address from ``value``, preserving a bare local part."""
    _, address = parseaddr(value or "")
    return (address or (value or "")).strip()


def _address_domain(value: str) -> str:
    """Return the domain of ``value``, or an empty string when it has none."""
    address = _address_part(value)
    if "@" in address:
        return address.rsplit("@", 1)[1].strip()
    return ""


def _build_from_address(sender_value: str, user: str) -> tuple[str, str]:
    """Return ``(address, domain)`` for the From header and Message-ID.

    ``SMTP_FROM`` wins. When it is empty or has no domain, the SMTP user's
    domain is used so the Message-ID always carries a plausible domain.
    """
    user_address = _address_part(user)
    address = _address_part(sender_value) or user_address
    domain = _address_domain(sender_value) or _address_domain(user_address)
    if "@" not in address:
        address = f"{address or 'noreply'}@{domain or 'localhost'}"
    if not domain:
        domain = _address_domain(address) or "localhost"
    return address, domain


def _otp_html_body(code: str) -> str:
    """Return a minimal RTL HTML alternative with no external assets."""
    safe_code = html.escape(code)
    return (
        '<!DOCTYPE html>\n'
        '<html dir="rtl" lang="ar">\n'
        "<body style=\"margin:0;padding:24px;background:#f5f5f5;"
        'font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;">\n'
        '<div style="max-width:480px;margin:0 auto;padding:24px;'
        'background:#ffffff;border-radius:8px;">\n'
        "<p style=\"margin:0 0 12px;font-size:16px;\">رمز التحقق الخاص بك:</p>\n"
        '<p style="margin:0 0 12px;font-size:32px;font-weight:bold;'
        'letter-spacing:6px;text-align:center;direction:ltr;">'
        f"{safe_code}</p>\n"
        '<p style="margin:0;font-size:14px;color:#555555;">'
        f"الرمز صالح لمدة {OTP_TTL_MINUTES} دقائق ويُستخدم مرة واحدة.</p>\n"
        "</div>\n"
        "</body>\n"
        "</html>"
    )


def deliver_otp_email(
    to_email: str,
    code: str,
    purpose: OtpPurpose,
    *,
    smtp: dict[str, str | int] | None = None,
) -> SendOutcome:
    """Attempt OTP delivery and report *why* it did or did not happen.

    Unlike :func:`send_otp_email`, this distinguishes a genuine SMTP send from
    the development-only "logged, not sent" shortcut, so callers and operators
    can tell a working mail setup from a misconfigured one. The OTP code is
    never written to the logs when sending fails.
    """
    cfg = smtp if smtp is not None else {}
    host = str(cfg.get("host") or os.environ.get("SMTP_HOST", ""))
    port = int(cfg.get("port") or os.environ.get("SMTP_PORT") or "587")
    user = str(cfg.get("user") or os.environ.get("SMTP_USER", ""))
    auth = str(cfg.get("auth") or os.environ.get("SMTP_PASSWORD", ""))
    sender_value = str(cfg.get("from") or os.environ.get("SMTP_FROM", "")).strip()
    reply_to = str(cfg.get("reply_to") or os.environ.get("SMTP_REPLY_TO", "")).strip()
    use_tls = bool(cfg.get("tls", True))

    if not host or not user:
        app_env = os.environ.get("APP_ENV", "development").strip().lower()
        if app_env in ("development", "test"):
            logger.info("SMTP not configured; OTP for %s (%s): %s", to_email, purpose.value, code)
            return SendOutcome.DEV_LOGGED
        logger.error(
            "SMTP is not configured (SMTP_HOST/SMTP_USER empty) while APP_ENV=%s; "
            "refusing to send OTP email to %s. Configure the SMTP_* variables.",
            app_env,
            to_email,
        )
        return SendOutcome.NOT_CONFIGURED

    if purpose is OtpPurpose.PASSWORD_RESET:
        subject = "استعادة كلمة السر — رمز التحقق"
    else:
        subject = "تأكيد البريد الإلكتروني — رمز التحقق"
    body = (
        f"رمز التحقق الخاص بك: {code}\n"
        f"الرمز صالح لمدة {OTP_TTL_MINUTES} دقائق ويُستخدم مرة واحدة."
    )

    sender_address, sender_domain = _build_from_address(sender_value, user)

    message = EmailMessage()
    message["From"] = Address(display_name=FROM_DISPLAY_NAME, addr_spec=sender_address)
    message["To"] = to_email
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=sender_domain)
    if reply_to:
        message["Reply-To"] = reply_to
    message.set_content(body)
    message.add_alternative(_otp_html_body(code), subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if use_tls:
                server.starttls()
            server.login(user, auth)
            server.send_message(message)
        return SendOutcome.SENT
    except smtplib.SMTPRecipientsRefused as exc:
        logger.error(
            "SMTP refused OTP recipients for %s via %s:%s: %s",
            to_email,
            host,
            port,
            exc.recipients,
        )
        return SendOutcome.FAILED
    except (smtplib.SMTPDataError, smtplib.SMTPResponseException) as exc:
        logger.error(
            "SMTP rejected OTP email for %s via %s:%s (%s): code=%s reply=%s",
            to_email,
            host,
            port,
            type(exc).__name__,
            getattr(exc, "smtp_code", None),
            getattr(exc, "smtp_error", None),
        )
        return SendOutcome.FAILED
    except (smtplib.SMTPException, OSError) as exc:
        logger.error(
            "Failed to send OTP email to %s via %s:%s (%s): %s",
            to_email,
            host,
            port,
            type(exc).__name__,
            exc,
        )
        return SendOutcome.FAILED


def send_otp_email(
    to_email: str,
    code: str,
    purpose: OtpPurpose,
    *,
    smtp: dict[str, str | int] | None = None,
) -> bool:
    """Send the OTP via SMTP. Return True only when delivery actually succeeded.

    Thin compatibility wrapper over :func:`deliver_otp_email`. The development
    "logged only" shortcut counts as success so local flows keep working; every
    other outcome (not configured outside development, or a raised SMTP error)
    is a failure.
    """
    outcome = deliver_otp_email(to_email, code, purpose, smtp=smtp)
    return outcome in (SendOutcome.SENT, SendOutcome.DEV_LOGGED)


def smtp_status() -> dict[str, object]:
    """Report whether OTP email delivery is genuinely configured.

    Used by the admin settings view so a misconfigured production server is
    visible instead of silently reporting success. Never returns secrets.
    """
    host = os.environ.get("SMTP_HOST", "").strip()
    user = os.environ.get("SMTP_USER", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip() or user
    app_env = os.environ.get("APP_ENV", "development").strip().lower()
    configured = bool(host and user)
    if configured:
        state = "configured"
    elif app_env in ("development", "test"):
        state = "development_logged"
    else:
        state = "not_configured"
    return {
        "configured": configured,
        "state": state,
        "app_env": app_env,
        "host": host,
        "sender": sender,
    }


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
