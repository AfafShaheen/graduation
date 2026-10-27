import hmac
import logging
import os
import subprocess
import sys
import threading
import time

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

# On cPanel the app-root .env holds ONLY the values that must differ from the
# panel's env vars (e.g. UNIVERSITY_FILES_DIR, SMTP_HOST=127.0.0.1), so it wins.
env_file = os.path.join(APP_DIR, ".env")
if os.path.exists(env_file):
    from dotenv import load_dotenv
    load_dotenv(env_file, override=True)

# Importing the app here is safe: it starts no threads.
from app.main import app  # noqa: E402

_PREFIX = os.getenv("APP_URL_PREFIX", "/gradapi").rstrip("/")

# --------------------------------------------------------------------------- logging
# a2wsgi logs nothing, so an unhandled error returns 500 with an empty
# stderr.log. Write every traceback (and one line per worker start) here.
_err_log = logging.getLogger("graduation.errors")
if not _err_log.handlers:
    _fh = logging.FileHandler(os.path.join(APP_DIR, "app_errors.log"), encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    _err_log.addHandler(_fh)
    _err_log.addHandler(logging.StreamHandler(sys.stderr))
    _err_log.setLevel(logging.INFO)
    _err_log.propagate = False


class _LogErrors:
    """Write the full traceback of any unhandled error, then re-raise."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        try:
            await self.inner(scope, receive, send)
        except Exception:
            _err_log.exception(
                "Unhandled error on %s %s", scope.get("method"), scope.get("path")
            )
            raise


# --------------------------------------------------------------------------- app
# a2wsgi starts a background event-loop thread when ASGIMiddleware is created.
# Passenger may fork worker processes after loading this file, and threads do not
# survive a fork, so requests would hang forever. Create the middleware lazily,
# once per process, on the first request.
_asgi = None
_asgi_pid = None
_lock = threading.Lock()


def _get_asgi():
    global _asgi, _asgi_pid
    pid = os.getpid()
    if _asgi is None or _asgi_pid != pid:
        with _lock:
            if _asgi is None or _asgi_pid != pid:
                from a2wsgi import ASGIMiddleware
                _asgi = ASGIMiddleware(_LogErrors(app))
                _asgi_pid = pid
                # Non-secret values only: confirms a restart and what the app sees.
                _err_log.info(
                    "worker start pid=%s APP_ENV=%s SMTP_HOST=%s UNIVERSITY_FILES_DIR=%s",
                    pid,
                    os.getenv("APP_ENV"),
                    os.getenv("SMTP_HOST"),
                    os.getenv("UNIVERSITY_FILES_DIR"),
                )
    return _asgi


# --------------------------------------------------------------------------- ops: migrate
# One-shot "run migrations now" hook used by deploy/deploy.py (migrate.bat), so
# no cron job is needed. It is OFF unless the file .ops_token exists in the app
# root. deploy.py uploads that file over FTP with a fresh random token, calls
# POST <prefix>/__ops/migrate with header X-Ops-Token, and the file is deleted on
# the first call whatever the result. A token older than 10 minutes is refused.
_OPS_PATH = "/__ops/migrate"
_OPS_TOKEN_FILE = os.path.join(APP_DIR, ".ops_token")
_OPS_MAX_AGE_SECONDS = 600
_ops_lock = threading.Lock()


def _ops_response(start_response, status, text):
    body = text.encode("utf-8")
    start_response(status, [
        ("Content-Type", "text/plain; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
    ])
    return [body]


def _ops_migrate(environ, start_response):
    if environ.get("REQUEST_METHOD") != "POST":
        return _ops_response(start_response, "405 Method Not Allowed", "POST only\n")
    if not _ops_lock.acquire(blocking=False):
        return _ops_response(start_response, "409 Conflict", "a migration is already running\n")
    try:
        try:
            with open(_OPS_TOKEN_FILE, encoding="utf-8") as f:
                expected = f.read().strip()
            age = time.time() - os.path.getmtime(_OPS_TOKEN_FILE)
        except OSError:
            return _ops_response(start_response, "404 Not Found", "Not Found\n")
        finally:
            # One attempt per token, whatever happens next.
            try:
                os.remove(_OPS_TOKEN_FILE)
            except OSError:
                pass

        given = environ.get("HTTP_X_OPS_TOKEN", "").strip()
        if len(expected) < 32 or age > _OPS_MAX_AGE_SECONDS or not hmac.compare_digest(given, expected):
            _err_log.warning("ops/migrate refused (bad or expired token)")
            return _ops_response(start_response, "403 Forbidden", "refused\n")

        _err_log.info("ops/migrate started")
        try:
            proc = subprocess.run(
                [sys.executable, "-u", "-m", "scripts.run_migrations"],
                cwd=APP_DIR,
                env=os.environ.copy(),
                capture_output=True,
                text=True,
                timeout=300,
            )
            output = (proc.stdout or "") + (proc.stderr or "")
            code = proc.returncode
        except subprocess.TimeoutExpired:
            output, code = "TIMEOUT after 300s\n", 124
        _err_log.info("ops/migrate finished EXIT=%s", code)
        status = "200 OK" if code == 0 else "500 Internal Server Error"
        return _ops_response(start_response, status, f"{output}\nEXIT={code}\n")
    finally:
        _ops_lock.release()


def application(environ, start_response):
    # Passenger already strips /gradapi (SCRIPT_NAME=/gradapi, PATH_INFO=/health).
    # Keep this defensive strip in case a server config passes the full path.
    path = environ.get("PATH_INFO", "")
    if _PREFIX and (path == _PREFIX or path.startswith(_PREFIX + "/")):
        path = path[len(_PREFIX):] or "/"
        environ["PATH_INFO"] = path
    if path == _OPS_PATH:
        return _ops_migrate(environ, start_response)
    return _get_asgi()(environ, start_response)
