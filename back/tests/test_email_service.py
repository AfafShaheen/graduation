"""Tests for the SMTP configuration handling in ``app.services.email_service``."""

import logging
import smtplib
from email.header import decode_header, make_header

import pytest

from app.services import email_service

_TO_EMAIL = "grad" + "@" + "example.com"
_CODE = "482913"


class _CapturingSMTP:
    """Minimal SMTP double that records the message handed to the server."""

    sent_messages: list = []
    send_error: Exception | None = None

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def starttls(self):
        pass

    def login(self, user, auth):
        pass

    def send_message(self, message):
        type(self).sent_messages.append(message)
        if type(self).send_error is not None:
            raise type(self).send_error


@pytest.fixture
def capture_smtp(monkeypatch):
    _CapturingSMTP.sent_messages = []
    _CapturingSMTP.send_error = None
    monkeypatch.setattr(email_service.smtplib, "SMTP", _CapturingSMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", "relay" + "@" + "mail.example.org")
    monkeypatch.setenv("SMTP_FROM", "noreply" + "@" + "grad.example.org")
    monkeypatch.delenv("SMTP_REPLY_TO", raising=False)
    return _CapturingSMTP.sent_messages


def _send() -> None:
    outcome = email_service.deliver_otp_email(
        _TO_EMAIL, _CODE, email_service.OtpPurpose.EMAIL_VERIFICATION
    )
    assert outcome is email_service.SendOutcome.SENT


def test_empty_smtp_port_falls_back_to_587(monkeypatch):
    """An empty SMTP_PORT must not raise; it falls back to 587."""
    captured: dict[str, object] = {}

    class _FakeSMTP:
        def __init__(self, host, port, timeout=None):
            captured["host"] = host
            captured["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def starttls(self):
            pass

        def login(self, user, auth):
            pass

        def send_message(self, message):
            pass

    monkeypatch.setattr(email_service.smtplib, "SMTP", _FakeSMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("SMTP_USER", "sender")
    monkeypatch.setenv("SMTP_PORT", "")

    sent = email_service.send_otp_email(
        _TO_EMAIL, "123456", email_service.OtpPurpose.EMAIL_VERIFICATION
    )

    assert sent is True
    assert captured["port"] == 587


def test_message_has_required_headers_and_alternative_parts(capture_smtp):
    _send()

    message = capture_smtp[0]
    assert message["Date"]
    assert message["Message-ID"].endswith("@grad.example.org>")

    decoded_from = str(make_header(decode_header(message["From"])))
    expected_from = (
        email_service.FROM_DISPLAY_NAME
        + " <noreply"
        + "@"
        + "grad.example.org>"
    )
    assert decoded_from == expected_from
    assert message["Reply-To"] is None

    assert message.is_multipart()
    assert message.get_content_type() == "multipart/alternative"
    parts = message.get_payload()
    assert [part.get_content_type() for part in parts] == [
        "text/plain",
        "text/html",
    ]

    plain = message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert _CODE in plain
    assert _CODE in html
    assert 'dir="rtl"' in html
    assert "font-weight:bold" in html
    assert "http://" not in html
    assert "https://" not in html
    assert "<a " not in html


def test_message_id_and_from_fall_back_to_smtp_user_domain(capture_smtp, monkeypatch):
    monkeypatch.setenv("SMTP_FROM", "")

    _send()

    message = capture_smtp[0]
    assert message["Message-ID"].endswith("@mail.example.org>")
    fallback_sender = "relay" + "@" + "mail.example.org"
    assert fallback_sender in message["From"]


def test_reply_to_is_added_only_when_configured(capture_smtp, monkeypatch):
    monkeypatch.setenv("SMTP_REPLY_TO", "support" + "@" + "grad.example.org")

    _send()

    assert capture_smtp[0]["Reply-To"] == "support" + "@" + "grad.example.org"


def test_smtp_data_error_logs_status_and_reply_without_otp(capture_smtp, caplog):
    _CapturingSMTP.send_error = smtplib.SMTPDataError(
        550, b"5.7.1 Messages missing a valid Message-ID header are not accepted"
    )

    with caplog.at_level(logging.ERROR):
        outcome = email_service.deliver_otp_email(
            _TO_EMAIL, _CODE, email_service.OtpPurpose.EMAIL_VERIFICATION
        )

    assert outcome is email_service.SendOutcome.FAILED
    assert "550" in caplog.text
    assert "5.7.1" in caplog.text
    assert _CODE not in caplog.text
