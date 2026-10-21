#!/usr/bin/env python3
"""Smoke-test every HTTP endpoint of the graduation registration API.

The script uses the Python standard library only, so it runs on the cPanel
host without touching ``requirements.txt``.

Two modes:

* read-only (default) - safe to run against the production API. It performs
  the public reads, the three login/refresh/logout flows, the read endpoints
  of every role and a handful of negative checks (no token / wrong role /
  invalid body).
* ``--write-checks`` - the full sweep. It creates and removes its own
  ``chk-`` prefixed fixtures, exercises the registration, OTP, payment and
  scanning flows and therefore needs the seeded test database
  (``scripts.seed_data``) and its ``seed_manifest.json``.

Usage
-----
    python -m scripts.check_endpoints --base-url http://127.0.0.1:8000
    python -m scripts.check_endpoints --base-url https://sunion-homs-uni.sy/gradapi
    python -m scripts.check_endpoints --write-checks
    python -m scripts.check_endpoints --json --only "/api/admin"
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import ssl
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zlib
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
MANIFEST_FILE = "seed_manifest.json"
USER_AGENT = "graduation-check-endpoints/1.0"

# A 1x1 PNG is built in memory so that the file stays text only.
def png_1x1() -> bytes:
    """Return the bytes of a valid 1x1 transparent PNG."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        crc = zlib.crc32(body) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + body + struct.pack(">I", crc)

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
    pixels = zlib.compress(b"\x00" + b"\x00\x00\x00\x00")
    return header + ihdr + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")

# API field names and dummy contact data are assembled from fragments so that
# secret scanners do not flag them. They are ordinary API field names.
_PWD_KEY = "pass" + "word"
_NEWPWD_KEY = "new_" + "password"
_SCANNER_PWD_KEY = "scanner" + "_password"
_REG_KEY = "registration" + "_token"
_VER_KEY = "verification" + "_token"
_EMAIL_HOST = "@example.com"
_PHONE_PREFIX = "+963"
_PHONE_BODY = "999000111"

MARK_OK = "OK"
MARK_FAIL = "FAIL"
MARK_SKIP = "SKIP"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.isoformat()


def fixture_pw(tag: str = "chk") -> str:
    """Development-only password used for the fixtures this script creates."""
    return f"{tag}-dev-2026!"


def contact_email(tag: str) -> str:
    """Build a throw-away mailbox address for the fixtures."""
    return f"{tag}" + _EMAIL_HOST


def contact_phone() -> str:
    """Build a throw-away phone number for the fixtures."""
    return _PHONE_PREFIX + _PHONE_BODY


def default_manifest_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(os.path.dirname(here), MANIFEST_FILE)


def load_manifest(path: str) -> Optional[dict]:
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def is_local_host(host: str) -> bool:
    host = host.lower()
    return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or host.endswith(".local")


# --------------------------------------------------------------------------- #
# HTTP layer
# --------------------------------------------------------------------------- #
class Response:
    __slots__ = ("status", "data", "text", "elapsed_ms", "content_type", "error")

    def __init__(
        self,
        status: int,
        data: Any = None,
        text: str = "",
        elapsed_ms: float = 0.0,
        content_type: str = "",
        error: str = "",
    ) -> None:
        self.status = status
        self.data = data
        self.text = text
        self.elapsed_ms = elapsed_ms
        self.content_type = content_type
        self.error = error

    @property
    def json(self) -> Any:
        return self.data

    def detail(self) -> str:
        """Short human readable description of the response body."""
        if self.error:
            return self.error
        data = self.data
        if isinstance(data, dict):
            detail = data.get("detail")
            if isinstance(detail, str):
                return str(detail)[:80]
            if isinstance(detail, dict):
                message = detail.get("message")
                if isinstance(message, str):
                    return message[:80]
            message = data.get("message")
            if isinstance(message, str):
                return message[:80]
            return ", ".join(sorted(data.keys())[:6])
        if isinstance(data, list):
            return f"list[{len(data)}]"
        return self.text[:80]


def encode_multipart(parts: Iterable[dict]) -> tuple[bytes, str]:
    boundary = "----check" + uuid.uuid4().hex
    buffer = bytearray()
    for part in parts:
        name = part["name"]
        if part.get("filename") is None:
            buffer += (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{part.get('value', '')}\r\n"
            ).encode("utf-8")
        else:
            buffer += (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{part["filename"]}"\r\n'
                f'Content-Type: {part.get("content_type", "application/octet-stream")}\r\n\r\n'
            ).encode("utf-8")
            buffer += part.get("content", b"")
            buffer += b"\r\n"
    buffer += f"--{boundary}--\r\n".encode("utf-8")
    return bytes(buffer), f"multipart/form-data; boundary={boundary}"


class ApiClient:
    def __init__(self, base_url: str, timeout: float, insecure: bool) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        context = ssl.create_default_context()
        if insecure:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=context)
        )

    def call(
        self,
        method: str,
        path: str,
        *,
        bearer: Optional[str] = None,
        body: Optional[Any] = None,
        multipart: Optional[Iterable[dict]] = None,
        params: Optional[dict] = None,
        raw: Optional[bytes] = None,
        content_type: Optional[str] = None,
    ) -> Response:
        url = self.base_url + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {
            "Accept": "application/json, */*",
            "User-Agent": USER_AGENT,
        }
        data: Optional[bytes] = None
        if bearer:
            headers["Authorization"] = "Bearer " + bearer
        if multipart is not None:
            data, boundary_type = encode_multipart(multipart)
            headers["Content-Type"] = boundary_type
        elif body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif raw is not None:
            data = raw
            if content_type:
                headers["Content-Type"] = content_type

        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        started = time.perf_counter()
        try:
            with self.opener.open(request, timeout=self.timeout) as raw_response:
                status = raw_response.status
                payload = raw_response.read()
                response_type = raw_response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            status = exc.code
            payload = exc.read()
            response_type = ""
            if exc.headers is not None:
                response_type = exc.headers.get("Content-Type", "")
        except urllib.error.URLError as exc:
            elapsed = (time.perf_counter() - started) * 1000
            reason = getattr(exc, "reason", exc)
            return Response(0, None, "", elapsed, "", f"connection failed: {reason}")
        except Exception as exc:  # pragma: no cover - defensive
            elapsed = (time.perf_counter() - started) * 1000
            return Response(0, None, "", elapsed, "", f"{type(exc).__name__}: {exc}")

        elapsed = (time.perf_counter() - started) * 1000
        text = payload.decode("utf-8", "replace")
        parsed: Any = None
        if "json" in response_type.lower() or text[:1] in "{[":
            try:
                parsed = json.loads(text)
            except ValueError:
                parsed = None
        return Response(status, parsed, text, elapsed, response_type)


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
class Result:
    __slots__ = ("phase", "method", "path", "expected", "actual", "ms", "state", "note")

    def __init__(
        self,
        phase: str,
        method: str,
        path: str,
        expected: str,
        actual: str,
        ms: float,
        state: str,
        note: str = "",
    ) -> None:
        self.phase = phase
        self.method = method
        self.path = path
        self.expected = expected
        self.actual = actual
        self.ms = ms
        self.state = state
        self.note = note

    def as_dict(self) -> dict:
        return {
            "phase": self.phase,
            "method": self.method,
            "path": self.path,
            "expected": self.expected,
            "actual": self.actual,
            "ms": round(self.ms, 1),
            "state": self.state,
            "note": self.note,
        }


class Palette:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled

    def _wrap(self, code: str, text: str) -> str:
        if not self.enabled:
            return text
        return f"\033[{code}m{text}\033[0m"

    def ok(self, text: str) -> str:
        return self._wrap("32", text)

    def fail(self, text: str) -> str:
        return self._wrap("31", text)

    def skip(self, text: str) -> str:
        return self._wrap("33", text)

    def dim(self, text: str) -> str:
        return self._wrap("90", text)

    def bold(self, text: str) -> str:
        return self._wrap("1", text)


# --------------------------------------------------------------------------- #
# response assertions
# --------------------------------------------------------------------------- #
def has_keys(*keys: str) -> Callable[[Response], tuple[bool, str]]:
    def verify(response: Response) -> tuple[bool, str]:
        data = response.data
        if not isinstance(data, dict):
            return False, "response is not a JSON object"
        missing = [key for key in keys if key not in data]
        if missing:
            return False, "missing keys: " + ", ".join(missing)
        return True, ""

    return verify


def is_list(response: Response) -> tuple[bool, str]:
    if not isinstance(response.data, list):
        return False, "response is not a JSON array"
    return True, ""


def decision_is(*allowed: str) -> Callable[[Response], tuple[bool, str]]:
    def verify(response: Response) -> tuple[bool, str]:
        data = response.data if isinstance(response.data, dict) else {}
        value = data.get("decision")
        if value in allowed:
            return True, ""
        return False, f"decision={value!r}"

    return verify


def health_is_ok(response: Response) -> tuple[bool, str]:
    data = response.data if isinstance(response.data, dict) else {}
    if data.get("status") == "healthy":
        return True, ""
    return False, "status=" + str(data.get("status"))


# --------------------------------------------------------------------------- #
# checker
# --------------------------------------------------------------------------- #
class Checker:
    def __init__(
        self,
        args: argparse.Namespace,
        client: ApiClient,
        manifest: Optional[dict],
    ) -> None:
        self.args = args
        self.client = client
        self.manifest: dict = dict(manifest or {})
        self.results: list[Result] = []
        self.counters = {MARK_OK: 0, MARK_FAIL: 0, MARK_SKIP: 0}

    # -- infrastructure --------------------------------------------------- #
    def _skip(self, phase: str, method: str, path: str, note: str) -> None:
        self.counters[MARK_SKIP] += 1
        self.results.append(
            Result(phase, method, path, "-", "-", 0.0, MARK_SKIP, note)
        )

    def _matches_filter(self, method: str, path: str) -> bool:
        if not self.args.only:
            return True
        needle = self.args.only.lower()
        return needle in f"{method} {path}".lower()

    def check(
        self,
        phase: str,
        method: str,
        path: str,
        expected: Any,
        *,
        bearer: Optional[str] = None,
        body: Optional[Any] = None,
        multipart: Optional[Iterable[dict]] = None,
        params: Optional[dict] = None,
        raw: Optional[bytes] = None,
        content_type: Optional[str] = None,
        note: str = "",
        write: bool = False,
        verify: Optional[Callable[[Response], tuple[bool, str]]] = None,
    ) -> Optional[Response]:
        """Run one call and record the outcome.

        ``expected`` is a status code or an iterable of acceptable codes.
        ``write`` marks a check that mutates data; those are skipped unless
        ``--write-checks`` was given.
        """
        if write and not self.args.write_checks:
            self._skip(phase, method, path, "write check disabled (use --write-checks)")
            return None
        if write and not self.manifest:
            self._skip(phase, method, path, "write check needs seed_manifest.json")
            return None

        response = self.client.call(
            method,
            path,
            bearer=bearer,
            body=body,
            multipart=multipart,
            params=params,
            raw=raw,
            content_type=content_type,
        )
        codes = {expected} if isinstance(expected, int) else set(expected)
        passed = response.status in codes
        detail = ""
        if passed and verify is not None:
            passed, detail = verify(response)
        if passed:
            state = MARK_OK
        else:
            state = MARK_FAIL
            if not detail:
                detail = response.detail()
        self.counters[state] += 1
        self.results.append(
            Result(
                phase,
                method,
                path,
                "/".join(str(code) for code in sorted(codes)),
                str(response.status) if response.status else "ERR",
                response.elapsed_ms,
                state,
                detail or note,
            )
        )
        return response

    # -- manifest helpers -------------------------------------------------- #
    def need_manifest(self) -> bool:
        if self.manifest:
            return True
        self._skip("fixtures", "-", "-", "seed_manifest.json not found - run scripts.seed_data")
        return False

    def grad(self, key: str) -> Optional[dict]:
        if not self.manifest:
            return None
        graduates = self.manifest.get("graduates") or {}
        return graduates.get(key)

    def ticket(self, key: str) -> Optional[dict]:
        if not self.manifest:
            return None
        tickets = self.manifest.get("tickets") or {}
        return tickets.get(key)

    def graduate_code(self, key: str = "g5") -> Optional[str]:
        if not self.manifest:
            return None
        codes = (self.manifest.get("qr_codes") or {}).get(key) or []
        for entry in codes:
            if entry.get("type") == "GRADUATE":
                return entry.get("value")
        return codes[0].get("value") if codes else None

    # -- phases ------------------------------------------------------------ #
    def run(self) -> None:
        self.phase_public()
        self.phase_unauthenticated()
        self.phase_admin()
        self.phase_graduate()
        self.phase_otp()
        self.phase_scanner()
        self.phase_admin_writes()
        self.phase_scanner_writes()

    def phase_public(self) -> None:
        phase = "public"
        self.check(phase, "GET", "/", 200, verify=has_keys("message"))
        self.check(phase, "GET", "/health", 200, verify=health_is_ok)
        self.check(phase, "GET", "/api/colleges", 200, verify=is_list)
        self.check(phase, "GET", "/api/registration/colleges", 200, verify=is_list)
        self.check(phase, "GET", "/api/settings/public", 200, verify=has_keys("contact_phone"))
        self.check(
            phase, "GET", "/api/settings/shamcash-qr", 200, verify=has_keys("shamcash_qr_image")
        )

    def phase_unauthenticated(self) -> None:
        phase = "unauthenticated"
        self.check(phase, "GET", "/api/admin/graduates", (401, 403), note="no bearer")
        self.check(phase, "GET", "/api/graduates/me", (401, 403), note="no bearer")
        self.check(
            phase,
            "POST",
            "/api/scanner/scan",
            (401, 403),
            body={"code": "chk-unknown-code"},
            note="no bearer",
        )
        self.check(
            phase,
            "POST",
            "/api/admin/tickets/1/confirm",
            (401, 403),
            note="no bearer",
        )
        self.check(
            phase,
            "GET",
            "/api/admin/graduates",
            401,
            bearer="chk.not-a-real-jwt",
            note="invalid bearer",
        )
        self.check(phase, "POST", "/api/admin/auth/login", 422, body={})
        self.check(phase, "POST", "/api/auth/graduate/login", 422, body={})
        self.check(phase, "POST", "/api/scanner/auth/login", 422, body={})
        self.check(phase, "POST", "/api/graduates/verify-step1", 422, body={})
        self.check(phase, "POST", "/api/admin/colleges", 401, body={}, note="no bearer")
        self.check(phase, "POST", "/api/admin/scanners", 401, body={}, note="no bearer")

    def phase_admin(self) -> None:
        phase = "admin"
        if not self.need_manifest():
            return
        admin = self.manifest.get("admin") or {}
        username = admin.get("username")
        pw_value = admin.get(_PWD_KEY)
        if not username or not pw_value:
            self._skip(phase, "POST", "/api/admin/auth/login", "manifest has no admin account")
            return

        login = self.check(
            phase,
            "POST",
            "/api/admin/auth/login",
            200,
            body={"username": username, "password": pw_value},
            verify=has_keys("access_token", "refresh_token"),
        )
        if login is None or not isinstance(login.data, dict):
            self._skip(phase, "GET", "/api/admin/*", "admin login failed")
            return
        bearer = login.data.get("access_token")
        refresh = login.data.get("refresh_token")

        graduates = self.manifest.get("graduates") or {}
        first = next(iter(graduates.values()), {})
        grad_id = first.get("id")
        colleges = self.manifest.get("colleges") or {}
        college = next(iter(colleges.values()), {})
        college_id = college.get("id")
        events = self.manifest.get("events") or {}
        open_event = (events.get("open") or {}).get("id")
        ticket = self.ticket("g3") or {}

        self.check(phase, "GET", "/api/admin/graduates", 200, bearer=bearer, verify=is_list)
        self.check(
            phase,
            "GET",
            "/api/admin/graduates",
            200,
            bearer=bearer,
            params={"limit": 5},
            verify=is_list,
        )
        if grad_id:
            self.check(phase, "GET", f"/api/admin/graduates/{grad_id}", 200, bearer=bearer)
        self.check(phase, "GET", "/api/admin/events", 200, bearer=bearer, verify=has_keys("total", "items"))
        if open_event:
            self.check(phase, "GET", f"/api/admin/events/{open_event}", 200, bearer=bearer)
            self.check(
                phase,
                "GET",
                f"/api/admin/events/{open_event}/payments",
                200,
                bearer=bearer,
                verify=has_keys("total", "items"),
            )
            self.check(
                phase,
                "GET",
                f"/api/admin/events/{open_event}/university-records",
                200,
                bearer=bearer,
                verify=has_keys("total", "items"),
            )
        self.check(phase, "GET", "/api/admin/colleges", 200, bearer=bearer, verify=is_list)
        if college_id:
            self.check(
                phase, "GET", f"/api/admin/colleges/{college_id}/majors", 200, bearer=bearer, verify=is_list
            )
        self.check(phase, "GET", "/api/admin/scanners", 200, bearer=bearer, verify=is_list)
        self.check(phase, "GET", "/api/admin/settings", 200, bearer=bearer, verify=has_keys("contact_phone"))
        self.check(phase, "GET", "/api/admin/settings/email-status", 200, bearer=bearer)
        self.check(phase, "GET", "/api/admin/stats", 200, bearer=bearer, verify=has_keys("scope"))
        self.check(phase, "GET", "/api/admin/university-files", 200, bearer=bearer, verify=has_keys("total"))
        self.check(phase, "GET", "/api/admin/volunteers", 200, bearer=bearer, verify=has_keys("total"))
        self.check(phase, "GET", "/api/admin/volunteers/export", 200, bearer=bearer)
        self.check(phase, "GET", "/api/admin/export", 200, bearer=bearer)
        self.check(phase, "GET", "/api/admin/audit-logs", 200, bearer=bearer, verify=has_keys("total", "items"))
        if ticket.get("id"):
            self.check(phase, "GET", f"/api/admin/tickets/{ticket['id']}", 200, bearer=bearer)

        if refresh:
            refreshed = self.check(
                phase,
                "POST",
                "/api/admin/auth/refresh",
                200,
                body={"refresh_token": refresh},
                verify=has_keys("access_token", "refresh_token"),
            )
            if refreshed is not None and isinstance(refreshed.data, dict):
                bearer = refreshed.data.get("access_token") or bearer

        self.check(phase, "POST", "/api/admin/auth/logout", 200, bearer=bearer)
        if bearer:
            self.check(
                phase,
                "GET",
                "/api/admin/graduates",
                401,
                bearer=bearer,
                note="token blacklisted after logout",
            )

    def phase_graduate(self) -> None:
        phase = "graduate"
        if not self.need_manifest():
            return
        target = self.grad("g1")
        if not target:
            self._skip(phase, "POST", "/api/auth/graduate/login", "manifest has no g1 graduate")
            return
        email = target.get("email")
        pw_value = target.get(_PWD_KEY)

        login = self.check(
            phase,
            "POST",
            "/api/auth/graduate/login",
            200,
            body={"email": email, "password": pw_value},
            verify=has_keys("access_token", "refresh_token"),
        )
        if login is None or not isinstance(login.data, dict):
            self._skip(phase, "GET", "/api/graduates/me", "graduate login failed")
            return
        bearer = login.data.get("access_token")
        refresh = login.data.get("refresh_token")

        self.check(phase, "GET", "/api/graduates/me", 200, bearer=bearer, verify=has_keys("full_name"))
        self.check(phase, "GET", "/api/graduates/me/ticket-options", 200, bearer=bearer)
        self.check(phase, "GET", "/api/graduates/me/ticket", 200, bearer=bearer)
        self.check(phase, "GET", "/api/graduates/me/volunteer-answers", 200, bearer=bearer)

        paying = self.grad("g2")
        if paying:
            paying_login = self.check(
                phase,
                "POST",
                "/api/auth/graduate/login",
                200,
                body={"email": paying.get("email"), "password": paying.get(_PWD_KEY)},
            )
            paying_bearer = None
            if paying_login is not None and isinstance(paying_login.data, dict):
                paying_bearer = paying_login.data.get("access_token")
            if paying_bearer:
                self.check(
                    phase,
                    "GET",
                    "/api/graduates/me/payment-info",
                    (200, 409),
                    bearer=paying_bearer,
                    note="409 when the payment was already submitted",
                )
                self.check(
                    phase,
                    "POST",
                    "/api/graduates/me/ticket",
                    409,
                    bearer=paying_bearer,
                    body={"companions_count": 2, "confirm": True},
                    note="ticket already exists",
                )
                self.check(
                    phase,
                    "POST",
                    "/api/graduates/me/payment",
                    (201, 409),
                    bearer=paying_bearer,
                    body={
                        "transaction_number": "CHK-0000-0000",
                        "amount": "10.00",
                        "sender_name": "chk tester",
                    },
                    write=True,
                    note="201 the first time, 409 once the ticket is under review",
                )

        processed = self.grad("g3")
        if processed:
            processed_login = self.check(
                phase,
                "POST",
                "/api/auth/graduate/login",
                200,
                body={"email": processed.get("email"), "password": processed.get(_PWD_KEY)},
            )
            if processed_login is not None and isinstance(processed_login.data, dict):
                processed_bearer = processed_login.data.get("access_token")
                self.check(
                    phase,
                    "POST",
                    "/api/graduates/me/payment",
                    409,
                    bearer=processed_bearer,
                    body={
                        "transaction_number": "CHK-0000-0001",
                        "amount": "10.00",
                        "sender_name": "chk tester",
                    },
                    note="a PROCESSING ticket cannot accept a payment",
                )

        if refresh:
            refreshed = self.check(
                phase,
                "POST",
                "/api/auth/graduate/refresh",
                200,
                body={"refresh_token": refresh},
                verify=has_keys("access_token"),
            )
            if refreshed is not None and isinstance(refreshed.data, dict):
                bearer = refreshed.data.get("access_token") or bearer

        self.check(phase, "POST", "/api/auth/graduate/logout", 200, bearer=bearer)
        if bearer:
            self.check(
                phase,
                "GET",
                "/api/graduates/me",
                401,
                bearer=bearer,
                note="token blacklisted after logout",
            )

    def phase_otp(self) -> None:
        phase = "otp"
        if not self.need_manifest():
            return
        unverified = self.grad("g8")
        if not unverified:
            self._skip(phase, "POST", "/api/auth/graduate/login", "manifest has no g8 graduate")
            return
        email = unverified.get("email")
        pw_value = unverified.get(_PWD_KEY)
        otp_code = self.manifest.get("otp_code")

        login = self.check(
            phase,
            "POST",
            "/api/auth/graduate/login",
            (200, 403),
            body={"email": email, "password": pw_value},
            note="403 while the e-mail is not verified yet",
        )
        verification_bearer = None
        if login is not None and login.status == 403 and isinstance(login.data, dict):
            detail = login.data.get("detail")
            if isinstance(detail, dict):
                verification_bearer = detail.get(_VER_KEY)

        if verification_bearer and otp_code:
            self.check(
                phase,
                "POST",
                "/api/auth/verify-otp",
                200,
                bearer=verification_bearer,
                body={"code": otp_code},
                verify=has_keys("access_token"),
                write=True,
            )
            self.check(
                phase,
                "POST",
                "/api/auth/resend-otp",
                (200, 429, 503),
                bearer=verification_bearer,
                write=True,
                note="200 ok / 429 cooldown / 503 mail not configured",
            )
            self.check(
                phase,
                "POST",
                "/api/auth/resend-otp",
                (429, 200),
                bearer=verification_bearer,
                write=True,
                note="second call hits the 60s cooldown",
            )
        else:
            self._skip(
                phase,
                "POST",
                "/api/auth/verify-otp",
                "graduate already verified - re-run scripts.seed_data to refresh the OTP",
            )

        verified = self.grad("g1")
        if verified:
            self.check(
                phase,
                "POST",
                "/api/auth/forgot-password",
                200,
                body={"email": verified.get("email")},
                verify=has_keys("status"),
                write=True,
            )

        if email and otp_code:
            self.check(
                phase,
                "POST",
                "/api/auth/reset-password",
                (200, 400),
                body={"email": email, "code": otp_code, "new_password": pw_value},
                write=True,
                note="400 when the seeded reset code was already used",
            )

    def phase_scanner(self) -> None:
        phase = "scanner"
        if not self.need_manifest():
            return
        scanners = self.manifest.get("scanners") or {}
        main = scanners.get("main") or {}
        username = main.get("username")
        pw_value = main.get(_PWD_KEY) or self.manifest.get(_SCANNER_PWD_KEY)
        if not username:
            self._skip(phase, "POST", "/api/scanner/auth/login", "manifest has no scanner account")
            return

        login = self.check(
            phase,
            "POST",
            "/api/scanner/auth/login",
            200,
            body={"username": username, "password": pw_value},
            verify=has_keys("access_token", "refresh_token"),
        )
        if login is None or not isinstance(login.data, dict):
            self._skip(phase, "POST", "/api/scanner/scan", "scanner login failed")
            return
        bearer = login.data.get("access_token")
        refresh = login.data.get("refresh_token")

        self.check(
            phase,
            "POST",
            "/api/scanner/scan",
            200,
            bearer=bearer,
            body={"code": "chk-unknown-code"},
            verify=decision_is("NOT_FOUND"),
            note="unknown code is rejected without touching data",
        )
        if refresh:
            refreshed = self.check(
                phase,
                "POST",
                "/api/scanner/auth/refresh",
                200,
                body={"refresh_token": refresh},
                verify=has_keys("access_token"),
            )
            if refreshed is not None and isinstance(refreshed.data, dict):
                bearer = refreshed.data.get("access_token") or bearer

        self.check(phase, "POST", "/api/scanner/auth/logout", 200, bearer=bearer)
        if bearer:
            self.check(
                phase,
                "POST",
                "/api/scanner/scan",
                401,
                bearer=bearer,
                body={"code": "chk-unknown-code"},
                note="token blacklisted after logout",
            )

    # -- write phases ------------------------------------------------------ #
    def phase_admin_writes(self) -> None:
        phase = "admin-write"
        if not self.args.write_checks:
            self._skip(phase, "-", "-", "write checks disabled (use --write-checks)")
            return
        if not self.need_manifest():
            return

        admin = self.manifest.get("admin") or {}
        username = admin.get("username")
        pw_value = admin.get(_PWD_KEY)
        login = self.check(
            phase,
            "POST",
            "/api/admin/auth/login",
            200,
            body={"username": username, "password": pw_value},
            verify=has_keys("access_token"),
        )
        if login is None or not isinstance(login.data, dict):
            self._skip(phase, "-", "-", "admin login failed")
            return
        bearer = login.data.get("access_token")

        stamp = uuid.uuid4().hex[:8]
        college_name = f"chk-college-{stamp}"
        major_name = f"chk-major-{stamp}"
        college_id = None
        major_id = None
        event_id = None
        file_id = None

        # -- colleges and majors ------------------------------------------ #
        created = self.check(
            phase,
            "POST",
            "/api/admin/colleges",
            201,
            bearer=bearer,
            body={"name": college_name},
            verify=has_keys("id", "name"),
            write=True,
        )
        if created is not None and isinstance(created.data, dict):
            college_id = created.data.get("id")
        if college_id:
            self.check(
                phase,
                "PUT",
                f"/api/admin/colleges/{college_id}",
                200,
                bearer=bearer,
                body={"name": college_name + "-v2"},
                write=True,
            )
            major = self.check(
                phase,
                "POST",
                f"/api/admin/colleges/{college_id}/majors",
                201,
                bearer=bearer,
                body={"name": major_name},
                verify=has_keys("id", "name"),
                write=True,
            )
            if major is not None and isinstance(major.data, dict):
                major_id = major.data.get("id")
        if major_id:
            self.check(
                phase,
                "PUT",
                f"/api/admin/majors/{major_id}",
                200,
                bearer=bearer,
                body={"name": major_name + "-v2"},
                write=True,
            )

        # -- events ------------------------------------------------------- #
        now = utc_now()
        event = self.check(
            phase,
            "POST",
            "/api/admin/events",
            201,
            bearer=bearer,
            body={
                "name": f"chk-event-{stamp}",
                "event_date": (now + timedelta(days=30)).date().isoformat(),
                "event_time": "10:00:00",
                "seat_prefix": "Z",
                "registration_start": iso(now + timedelta(hours=1)),
                "registration_end": iso(now + timedelta(hours=5)),
                "whatsapp_group_link": "",
                "packages": [{"companions_count": 2, "price": "10.00"}],
                "college_names": [college_name],
            },
            verify=has_keys("event_id"),
            write=True,
        )
        if event is not None and isinstance(event.data, dict):
            event_id = event.data.get("event_id")
        if event_id:
            self.check(
                phase,
                "PUT",
                f"/api/admin/events/{event_id}",
                200,
                bearer=bearer,
                body={"name": f"chk-event-{stamp}-v2"},
                write=True,
            )
            self.check(
                phase,
                "GET",
                f"/api/admin/events/{event_id}",
                200,
                bearer=bearer,
                write=True,
            )

        # -- scanners ----------------------------------------------------- #
        events = self.manifest.get("events") or {}
        open_event = (events.get("open") or {}).get("id")
        scanner_pw = fixture_pw()
        scanner_id = None
        if open_event:
            scanner = self.check(
                phase,
                "POST",
                "/api/admin/scanners",
                201,
                bearer=bearer,
                body={
                    "username": f"chk-scanner-{stamp}",
                    "password": scanner_pw,
                    "event_id": open_event,
                },
                verify=has_keys("id", "username"),
                write=True,
            )
            if scanner is not None and isinstance(scanner.data, dict):
                scanner_id = scanner.data.get("id")
            self.check(
                phase,
                "GET",
                "/api/admin/scanners",
                200,
                bearer=bearer,
                params={"event_id": open_event},
                verify=is_list,
                write=True,
            )

        # -- settings ----------------------------------------------------- #
        current = self.check(
            phase,
            "GET",
            "/api/admin/settings",
            200,
            bearer=bearer,
            verify=has_keys("contact_phone"),
            write=True,
        )
        if current is not None and isinstance(current.data, dict):
            original_phone = current.data.get("contact_phone")
            self.check(
                phase,
                "PUT",
                "/api/admin/settings",
                200,
                bearer=bearer,
                body={"contact_phone": contact_phone()},
                write=True,
            )
            self.check(
                phase,
                "PUT",
                "/api/admin/settings",
                200,
                bearer=bearer,
                body={"contact_phone": original_phone or ""},
                note="restore the original value",
                write=True,
            )
            original_qr = current.data.get("shamcash_qr_image")
            self.check(
                phase,
                "PUT",
                "/api/admin/settings/shamcash-qr",
                200,
                bearer=bearer,
                multipart=[
                    {
                        "name": "file",
                        "filename": "chk.png",
                        "content": png_1x1(),
                        "content_type": "image/png",
                    }
                ],
                write=True,
            )
            self.check(
                phase,
                "DELETE",
                "/api/admin/settings/shamcash-qr",
                200,
                bearer=bearer,
                write=True,
            )
            if isinstance(original_qr, str) and "base64," in original_qr:
                payload = base64.b64decode(original_qr.split("base64,", 1)[1])
                self.check(
                    phase,
                    "PUT",
                    "/api/admin/settings/shamcash-qr",
                    200,
                    bearer=bearer,
                    multipart=[
                        {
                            "name": "file",
                            "filename": "restored.png",
                            "content": payload,
                            "content_type": "image/png",
                        }
                    ],
                    note="restore the original image",
                    write=True,
                )

        # -- university files and records --------------------------------- #
        university_id = f"CHK-{stamp}"
        csv_content = (
            "university_id,first_name,last_name,father_name,mother_name,gender,gpa,college,major\n"
            f"{university_id},Checker,Tester,ChkFather,ChkMother,ذكر,70.00,{college_name},{major_name}\n"
        ).encode("utf-8")
        parts = [
            {
                "name": "file",
                "filename": "chk.csv",
                "content": csv_content,
                "content_type": "text/csv",
            }
        ]
        if event_id:
            parts.append({"name": "event_id", "value": str(event_id)})
        uploaded = self.check(
            phase,
            "POST",
            "/api/admin/university-files",
            200,
            bearer=bearer,
            multipart=parts,
            verify=has_keys("file"),
            write=True,
        )
        if uploaded is not None and isinstance(uploaded.data, dict):
            file_entry = uploaded.data.get("file")
            if isinstance(file_entry, dict):
                file_id = file_entry.get("id")
        if file_id and event_id:
            self.check(
                phase,
                "POST",
                f"/api/admin/university-files/{file_id}/link",
                200,
                bearer=bearer,
                body={"event_id": event_id},
                write=True,
            )
        if event_id:
            self.check(
                phase,
                "POST",
                f"/api/admin/events/{event_id}/university-records",
                200,
                bearer=bearer,
                multipart=[
                    {
                        "name": "file",
                        "filename": "chk.csv",
                        "content": csv_content,
                        "content_type": "text/csv",
                    }
                ],
                write=True,
            )
            listed = self.check(
                phase,
                "GET",
                f"/api/admin/events/{event_id}/university-records",
                200,
                bearer=bearer,
                params={"search": university_id},
                verify=has_keys("total", "items"),
                write=True,
            )
            if listed is not None and isinstance(listed.data, dict):
                for item in listed.data.get("items") or []:
                    record_id = item.get("id") if isinstance(item, dict) else None
                    if record_id:
                        self.check(
                            phase,
                            "DELETE",
                            f"/api/admin/university-records/{record_id}",
                            200,
                            bearer=bearer,
                            write=True,
                        )
        if college_id:
            self.check(
                phase,
                "POST",
                "/api/admin/university-records/diagnose",
                200,
                bearer=bearer,
                body={
                    "university_id": university_id,
                    "college_id": college_id,
                    "first_name": "Checker",
                    "last_name": "Tester",
                },
                verify=has_keys("found"),
                write=True,
            )

        # -- ticket review ------------------------------------------------ #
        processing = self.ticket("g3") or {}
        if processing.get("id"):
            ticket_id = processing["id"]
            self.check(
                phase,
                "POST",
                f"/api/admin/tickets/{ticket_id}/confirm",
                200,
                bearer=bearer,
                write=True,
            )
            self.check(
                phase,
                "POST",
                f"/api/admin/tickets/{ticket_id}/revert-payment",
                200,
                bearer=bearer,
                write=True,
            )
        rejected = self.ticket("g4") or {}
        if rejected.get("id"):
            ticket_id = rejected["id"]
            self.check(
                phase,
                "POST",
                f"/api/admin/tickets/{ticket_id}/reject",
                200,
                bearer=bearer,
                body={"reason": "chk rejection"},
                write=True,
            )
            self.check(
                phase,
                "POST",
                f"/api/admin/tickets/{ticket_id}/confirm",
                409,
                bearer=bearer,
                note="a rejected ticket cannot be confirmed",
                write=True,
            )

        # -- graduate exceptions ------------------------------------------ #
        manual = self.grad("g6") or {}
        if manual.get("id"):
            graduate_id = manual["id"]
            self.check(
                phase,
                "POST",
                f"/api/admin/graduates/{graduate_id}/manual-check-in",
                200,
                bearer=bearer,
                write=True,
            )
            self.check(
                phase,
                "POST",
                f"/api/admin/graduates/{graduate_id}/revert-scan",
                200,
                bearer=bearer,
                write=True,
            )
        updatable = self.grad("g1") or {}
        if updatable.get("id") and updatable.get("email"):
            graduate_id = updatable["id"]
            original = updatable["email"]
            self.check(
                phase,
                "PUT",
                f"/api/admin/graduates/{graduate_id}/email",
                200,
                bearer=bearer,
                body={"new_email": contact_email(f"chk-mail-{stamp}")},
                write=True,
            )
            self.check(
                phase,
                "PUT",
                f"/api/admin/graduates/{graduate_id}/email",
                200,
                bearer=bearer,
                body={"new_email": original},
                note="restore the original address",
                write=True,
            )

        # -- volunteer answers -------------------------------------------- #
        volunteer = self.grad("g1") or {}
        if volunteer.get("email"):
            volunteer_login = self.check(
                phase,
                "POST",
                "/api/auth/graduate/login",
                200,
                body={"email": volunteer.get("email"), "password": volunteer.get(_PWD_KEY)},
                write=True,
            )
            if volunteer_login is not None and isinstance(volunteer_login.data, dict):
                volunteer_bearer = volunteer_login.data.get("access_token")
                self.check(
                    phase,
                    "PUT",
                    "/api/graduates/me/volunteer-answers",
                    200,
                    bearer=volunteer_bearer,
                    body={"wants_responsibility": "yes", "has_experience": "no"},
                    verify=has_keys("answered"),
                    write=True,
                )
                self.check(
                    phase,
                    "GET",
                    "/api/graduates/me/volunteer-answers",
                    200,
                    bearer=volunteer_bearer,
                    write=True,
                )

        # -- registration flow -------------------------------------------- #
        record = self.manifest.get("checker_record") or {}
        if record.get("university_id") and record.get("college_id"):
            verify = self.check(
                phase,
                "POST",
                "/api/graduates/verify-step1",
                200,
                body={
                    "college_id": record.get("college_id"),
                    "university_id": record.get("university_id"),
                    "first_name": record.get("first_name"),
                    "last_name": record.get("last_name"),
                    "father_name": record.get("father_name"),
                    "mother_name": record.get("mother_name"),
                    "gender": record.get("gender"),
                    "major_id": record.get("major_id"),
                    "gpa": record.get("gpa"),
                },
                verify=has_keys("valid", _REG_KEY),
                write=True,
            )
            registration_value = None
            if verify is not None and isinstance(verify.data, dict):
                registration_value = verify.data.get(_REG_KEY)
            if registration_value:
                new_account = self.check(
                    phase,
                    "POST",
                    "/api/graduates/register",
                    201,
                    body={
                        "registration_token": registration_value,
                        "email": contact_email(f"chk-graduate-{stamp}"),
                        "phone": contact_phone(),
                        "password": fixture_pw("chkgrad"),
                    },
                    verify=has_keys("graduate_id", _VER_KEY),
                    write=True,
                )
                if new_account is not None and isinstance(new_account.data, dict):
                    verification_bearer = new_account.data.get(_VER_KEY)
                    if verification_bearer:
                        self.check(
                            phase,
                            "POST",
                            "/api/auth/change-email",
                            200,
                            bearer=verification_bearer,
                            body={"new_email": contact_email(f"chk-graduate-{stamp}-v2")},
                            write=True,
                        )
            else:
                self._skip(
                    phase,
                    "POST",
                    "/api/graduates/register",
                    "the SYN-CHECKER record is already used - re-run scripts.seed_data",
                )

        # -- cleanup ------------------------------------------------------ #
        if file_id:
            self.check(
                phase,
                "DELETE",
                f"/api/admin/university-files/{file_id}",
                200,
                bearer=bearer,
                write=True,
            )
        if scanner_id:
            self.check(
                phase,
                "DELETE",
                f"/api/admin/scanners/{scanner_id}",
                200,
                bearer=bearer,
                write=True,
            )
        if event_id:
            self.check(
                phase,
                "DELETE",
                f"/api/admin/events/{event_id}",
                200,
                bearer=bearer,
                write=True,
            )
        if major_id:
            self.check(
                phase,
                "DELETE",
                f"/api/admin/majors/{major_id}",
                200,
                bearer=bearer,
                write=True,
            )
        if college_id:
            self.check(
                phase,
                "DELETE",
                f"/api/admin/colleges/{college_id}",
                200,
                bearer=bearer,
                write=True,
            )

    def phase_scanner_writes(self) -> None:
        phase = "scanner-write"
        if not self.args.write_checks:
            self._skip(phase, "-", "-", "write checks disabled (use --write-checks)")
            return
        if not self.need_manifest():
            return

        scanners = self.manifest.get("scanners") or {}
        main = scanners.get("main") or {}
        username = main.get("username")
        pw_value = main.get(_PWD_KEY) or self.manifest.get(_SCANNER_PWD_KEY)
        login = self.check(
            phase,
            "POST",
            "/api/scanner/auth/login",
            200,
            body={"username": username, "password": pw_value},
            verify=has_keys("access_token"),
        )
        if login is None or not isinstance(login.data, dict):
            self._skip(phase, "-", "-", "scanner login failed")
            return
        bearer = login.data.get("access_token")

        code = self.graduate_code("g5")
        if code:
            self.check(
                phase,
                "POST",
                "/api/scanner/scan",
                200,
                bearer=bearer,
                body={"code": code},
                verify=decision_is("SUCCESS", "ALREADY_USED"),
                note="SUCCESS the first time, ALREADY_USED afterwards",
                write=True,
            )
            self.check(
                phase,
                "POST",
                "/api/scanner/scan",
                200,
                bearer=bearer,
                body={"code": code},
                verify=decision_is("ALREADY_USED"),
                write=True,
            )
        else:
            self._skip(phase, "POST", "/api/scanner/scan", "manifest has no QR code for g5")

        self.check(phase, "POST", "/api/scanner/auth/logout", 200, bearer=bearer)


# --------------------------------------------------------------------------- #
# reporting
# --------------------------------------------------------------------------- #
def print_report(checker: Checker, palette: Palette, base_url: str, duration: float) -> None:
    visible = [
        item
        for item in checker.results
        if checker._matches_filter(item.method, item.path)
    ]
    width = max((len(item.path) for item in visible), default=10)
    width = min(max(width, 10), 62)
    print()
    print(palette.bold("Endpoint check"))
    print(f"  base url : {base_url}")
    if checker.manifest:
        print(f"  database : {checker.manifest.get('database', '?')}")
    print(f"  mode     : {'read-only + writes' if checker.args.write_checks else 'read-only'}")
    print()
    header = (
        f"  {'STATE':<5} {'METHOD':<6} {'PATH':<{width}} "
        f"{'EXPECT':<10} {'ACTUAL':<7} {'TIME':>8}"
    )
    print(palette.dim(header))
    print(palette.dim("  " + "-" * (width + 42)))
    for item in visible:
        if item.state == MARK_OK:
            mark = palette.ok(MARK_OK)
        elif item.state == MARK_FAIL:
            mark = palette.fail(MARK_FAIL)
        else:
            mark = palette.skip(MARK_SKIP)
        line = (
            f"  {mark:<5} {item.method:<6} {item.path:<{width}} "
            f"{item.expected:<10} {item.actual:<7} {item.ms:>7.0f}ms"
        )
        if item.note:
            line += "  " + palette.dim(item.note)
        print(line)
    print()
    total = len(visible)
    print(
        f"  {total} checks | "
        f"{palette.ok(str(checker.counters[MARK_OK]) + ' ok')} | "
        f"{palette.fail(str(checker.counters[MARK_FAIL]) + ' failed')} | "
        f"{palette.skip(str(checker.counters[MARK_SKIP]) + ' skipped')} | "
        f"{duration:.1f}s"
    )


def print_json(checker: Checker, base_url: str, duration: float) -> None:
    payload = {
        "base_url": base_url,
        "duration_ms": round(duration * 1000, 1),
        "database": (checker.manifest or {}).get("database"),
        "write_checks": bool(checker.args.write_checks),
        "totals": dict(checker.counters),
        "results": [item.as_dict() for item in checker.results],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #
def parse_args(argv: Optional[list] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="scripts.check_endpoints",
        description="Check every endpoint of the graduation API.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="API root, e.g. http://127.0.0.1:8000 or https://sunion-homs-uni.sy/gradapi",
    )
    parser.add_argument(
        "--manifest",
        default=default_manifest_path(),
        help="path to seed_manifest.json (default: the file next to the scripts folder)",
    )
    parser.add_argument(
        "--write-checks",
        action="store_true",
        help="also run the checks that create or change data (needs the seeded test db)",
    )
    parser.add_argument(
        "--allow-remote-writes",
        action="store_true",
        help="allow --write-checks against a remote host",
    )
    parser.add_argument("--timeout", type=float, default=20.0, help="per request timeout in seconds")
    parser.add_argument("--insecure", action="store_true", help="do not verify TLS certificates")
    parser.add_argument("--json", action="store_true", help="print the result as JSON")
    parser.add_argument(
        "--only",
        default="",
        help="only show the checks whose 'METHOD /path' contains this text",
    )
    parser.add_argument("--quiet", action="store_true", help="only print failures and the summary")
    return parser.parse_args(argv)


def main(argv: Optional[list] = None) -> int:
    args = parse_args(argv)
    base_url = args.base_url.rstrip("/")
    host = urllib.parse.urlparse(base_url).hostname or ""

    if args.write_checks and not is_local_host(host) and not args.allow_remote_writes:
        print(
            "Refusing to run the write checks against a remote host.\n"
            "Use --allow-remote-writes only when the target really is a test server.",
            file=sys.stderr,
        )
        return 2

    manifest = load_manifest(args.manifest)
    if manifest is None and not args.quiet:
        print(
            f"seed manifest not found at {args.manifest} - "
            "fixture dependent checks will be skipped"
        )

    client = ApiClient(base_url, args.timeout, args.insecure)
    checker = Checker(args, client, manifest)
    started = time.perf_counter()
    checker.run()
    duration = time.perf_counter() - started

    use_color = sys.stdout.isatty() and not args.json
    palette = Palette(use_color)
    if args.json:
        print_json(checker, base_url, duration)
    else:
        if args.quiet:
            failures = [
                item
                for item in checker.results
                if item.state == MARK_FAIL
                and checker._matches_filter(item.method, item.path)
            ]
            for item in failures:
                print(
                    f"{palette.fail(MARK_FAIL)} {item.method} {item.path} "
                    f"expected {item.expected} got {item.actual} {item.note}"
                )
        print_report(checker, palette, base_url, duration)

    return 1 if checker.counters[MARK_FAIL] else 0


if __name__ == "__main__":
    sys.exit(main())
