"""Passenger WSGI entry point for the cPanel deploy (shared hosting, no Docker).

Passenger ("Setup Python App") imports this file and calls ``application``.
The ASGI FastAPI app is wrapped with a2wsgi so it can speak WSGI.

Configuration comes from the cPanel Python App env vars. A local ``.env``
file next to this script is loaded only when it exists (handy on a laptop);
it is NOT required.

The app is mounted under a URL prefix (``APP_URL_PREFIX``, default
``/gradapi``). Passenger normally strips that prefix from ``PATH_INFO``; if a
server ever leaves it in place, the wrapper below strips it defensively.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path

_env_file = Path(__file__).resolve().parent / ".env"
if _env_file.exists():
    from dotenv import load_dotenv

    load_dotenv(_env_file)

from a2wsgi import ASGIMiddleware

from app.main import app

_asgi = ASGIMiddleware(app)

APP_URL_PREFIX = os.environ.get("APP_URL_PREFIX", "/gradapi").rstrip("/")


def application(environ, start_response):
    prefix = APP_URL_PREFIX
    path_info = environ.get("PATH_INFO", "")
    if prefix and path_info.startswith(prefix):
        environ["PATH_INFO"] = path_info[len(prefix):] or "/"
    return _asgi(environ, start_response)
