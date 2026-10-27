"""Regression test for the Passenger WSGI entry point.

Passenger loads ``passenger_wsgi.py`` and then forks worker processes.
``a2wsgi.ASGIMiddleware`` starts a background event-loop thread when it is
created, and threads do not survive ``fork()`` — so if the middleware is
created at import time, every request in a forked worker is submitted to a
loop thread that does not exist and hangs forever.

The middleware must therefore be created lazily, once per process, on the
first request. This test reproduces the production hang: a request in the
parent process, then a request in a forked child. Skipped on Windows
(``os.fork`` is not available).
"""

import io
import json
import os
import signal
import sys
from pathlib import Path

import pytest

BACK_DIR = Path(__file__).resolve().parents[1]
if str(BACK_DIR) not in sys.path:
    sys.path.insert(0, str(BACK_DIR))

# app.core.database / app.core.security read these at import time.
os.environ.setdefault("JWT_SECRET_KEY", "test-only-placeholder-0123456789abcdef0123456789")
os.environ.setdefault("APP_ENV", "test")

from passenger_wsgi import application  # noqa: E402

pytestmark = pytest.mark.skipif(
    not hasattr(os, "fork"), reason="os.fork is not available on Windows"
)


def _environ(path_info, script_name="/gradapi"):
    return {
        "REQUEST_METHOD": "GET",
        "SCRIPT_NAME": script_name,
        "PATH_INFO": path_info,
        "QUERY_STRING": "",
        "SERVER_NAME": "localhost",
        "SERVER_PORT": "80",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
        "wsgi.input": io.BytesIO(b""),
        "wsgi.errors": io.StringIO(),
        "CONTENT_LENGTH": "0",
    }


def _call(path_info, script_name="/gradapi"):
    captured = {}

    def start_response(status, headers, exc_info=None):
        captured["status"] = int(status.split(" ", 1)[0])

    body = b"".join(application(_environ(path_info, script_name), start_response))
    return captured["status"], body


def _assert_welcome(status, body):
    assert status == 200
    assert json.loads(body)["message"].startswith("Welcome")


def test_root_in_parent():
    status, body = _call("/")
    _assert_welcome(status, body)


def test_defensive_prefix_strip():
    # A server config that passes the full path instead of stripping the
    # prefix must still reach the app (PATH_INFO=/gradapi/ -> "/").
    status, body = _call("/gradapi/")
    _assert_welcome(status, body)


def test_request_after_fork():
    """The production hang: the parent serves one request, then forks; the
    forked worker must still get a 200 within 10 s. The alarm guarantees the
    test can never hang."""
    status, body = _call("/")
    _assert_welcome(status, body)

    pid = os.fork()
    if pid == 0:
        # Child process: answer via os._exit so no pytest/atexit state runs.
        def _on_alarm(signum, frame):
            raise TimeoutError("request hung after fork")

        signal.signal(signal.SIGALRM, _on_alarm)
        signal.alarm(10)
        try:
            status, body = _call("/")
            ok = status == 200 and json.loads(body)["message"].startswith("Welcome")
        except Exception:
            ok = False
        finally:
            signal.alarm(0)
        os._exit(0 if ok else 1)

    _, wait_status = os.waitpid(pid, 0)
    assert os.waitstatus_to_exitcode(wait_status) == 0
