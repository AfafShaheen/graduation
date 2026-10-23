"""Tests for the SMTP configuration handling in ``app.services.email_service``."""

from app.services import email_service

_TO_EMAIL = "grad" + "@" + "example.com"


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
            captured["message"] = message

    monkeypatch.setattr(email_service.smtplib, "SMTP", _FakeSMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("SMTP_USER", "sender@uni.sy")
    monkeypatch.setenv("SMTP_FROM", "noreply@uni.sy")
    monkeypatch.setenv("SMTP_PORT", "")

    sent = email_service.send_otp_email(
        _TO_EMAIL, "123456", email_service.OtpPurpose.EMAIL_VERIFICATION
    )

    assert sent is True
    assert captured["port"] == 587
    msg = captured["message"]
    assert msg["Date"]
    assert "@uni.sy" in msg["Message-ID"]
    assert "اتحاد الطلبة" in msg["From"]
    assert msg.is_multipart()
    parts = list(msg.iter_parts())
    assert len(parts) == 2
    assert "123456" in parts[0].get_content()
    assert "<html" in parts[1].get_content().lower()
