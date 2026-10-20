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
                _asgi = ASGIMiddleware(app)
                _asgi_pid = pid
    return _asgi


def application(environ, start_response):
    # Passenger already strips /gradapi (SCRIPT_NAME=/gradapi, PATH_INFO=/health).
    # Keep this defensive strip in case a server config passes the full path.
    path = environ.get("PATH_INFO", "")
    if _PREFIX and (path == _PREFIX or path.startswith(_PREFIX + "/")):
        environ["PATH_INFO"] = path[len(_PREFIX):] or "/"
    return _get_asgi()(environ, start_response)
