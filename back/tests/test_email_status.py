"""Tests for SMTP delivery visibility (P7.1).

Covers the deliver_otp_email outcome distinction and the admin-visible
email-status endpoint, so a misconfigured mail setup cannot masquerade as a
working one.
"""

import os

import pytest

from app.services import email_service
from app.services.email_service import (
    OtpPurpose,
    SendOutcome,
    deliver_otp_email,
    send_otp_email,
    smtp_status,
)

_PURPOSE = OtpPurpose.EMAIL_VERIFICATION


def _clear_smtp_env(monkeypatch):
    for key in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"):
        monkeypatch.delenv(key, raising=False)


def test_not_configured_in_production_is_a_failure(monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")

    outcome = deliver_otp_email("[REDACTED]", "123456", _PURPOSE)

    assert outcome is SendOutcome.NOT_CONFIGURED
    assert send_otp_email("[REDACTED]", "123456", _PURPOSE) is False


def test_not_configured_in_development_is_logged_only(monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "development")

    outcome = deliver_otp_email("[REDACTED]", "123456", _PURPOSE)

    assert outcome is SendOutcome.DEV_LOGGED
    # The development shortcut still counts as success for existing callers.
    assert send_otp_email("[REDACTED]", "123456", _PURPOSE) is True


def test_configured_but_smtp_raises_reports_failed(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "user")
    monkeypatch.setenv("SMTP_PORT", "587")

    class _Boom:
        def __init__(self, *a, **k):
            raise OSError("connection refused")

    monkeypatch.setattr(email_service.smtplib, "SMTP", _Boom)

    outcome = deliver_otp_email("[REDACTED]", "123456", _PURPOSE)

    assert outcome is SendOutcome.FAILED
    assert send_otp_email("[REDACTED]", "123456", _PURPOSE) is False


def test_smtp_status_reports_configured(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "user")
    monkeypatch.setenv("SMTP_FROM", "[REDACTED]")
    monkeypatch.setenv("APP_ENV", "production")

    status = smtp_status()

    assert status["configured"] is True
    assert status["state"] == "configured"
    assert status["host"] == "smtp.example.com"
    assert "password" not in status

    # And with no configuration in production it is honestly flagged.
    _clear_smtp_env(monkeypatch)
    production_status = smtp_status()
    assert production_status["configured"] is False
    assert production_status["state"] == "not_configured"


async def _admin_token(client, make_admin):
    admin = await make_admin()
    resp = await client.post(
        "/api/admin/auth/login",
        json={"username": admin.username, "password": "AdminPass123!"},
    )
    return resp.json()["access_token"]


async def test_admin_email_status_endpoint_requires_auth(client):
    resp = await client.get("/api/admin/settings/email-status")
    assert resp.status_code in (401, 403)


async def test_admin_email_status_endpoint_exposes_state(client, make_admin, monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    token = await _admin_token(client, make_admin)

    resp = await client.get(
        "/api/admin/settings/email-status",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is False
    assert body["state"] == "not_configured"
