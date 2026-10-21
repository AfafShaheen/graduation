import os
import sys
import threading

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

env_file = os.path.join(APP_DIR, ".env")
if os.path.exists(env_file):
    from dotenv import load_dotenv
    load_dotenv(env_file, override=False)

# Importing the app here is safe: it starts no threads.
from app.main import app  # noqa: E402
import logging

_err_log = logging.getLogger("graduation.errors")
if not _err_log.handlers:
    _fh = logging.FileHandler(os.path.join(APP_DIR, "app_errors.log"), encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    _err_log.addHandler(_fh)
    _err_log.addHandler(logging.StreamHandler(sys.stderr))
    _err_log.setLevel(logging.INFO)


class _LogErrors:
    """Write the full traceback of any unhandled error (a2wsgi logs nothing)."""

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
_PREFIX = os.getenv("APP_URL_PREFIX", "/gradapi").rstrip("/")

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
    return _asgi


def application(environ, start_response):
    # Passenger already strips /gradapi (SCRIPT_NAME=/gradapi, PATH_INFO=/health).
    # Keep this defensive strip in case a server config passes the full path.
    path = environ.get("PATH_INFO", "")
    if _PREFIX and (path == _PREFIX or path.startswith(_PREFIX + "/")):
        environ["PATH_INFO"] = path[len(_PREFIX):] or "/"
    return _get_asgi()(environ, start_response)
