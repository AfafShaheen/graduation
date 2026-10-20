"""Create the single admin account from environment variables (cPanel).

The interactive ``create_admin.py`` cannot run from cPanel's "Execute python
script" button (there is no terminal to type the password into). This variant
reads ADMIN_USERNAME and ADMIN_PASSWORD from the environment, reuses the exact
same creation logic, validates the password with the same policy, and never
prints the password.

Usage (from the app root, after setting the two env vars):

    python -m scripts.create_admin_from_env
    python scripts/create_admin_from_env.py

On a cron job the Python app's env vars are NOT visible; load them from a file
instead (python-dotenv syntax, values are never printed):

    python -m scripts.create_admin_from_env --env-file /home/USER/graduation_back/.admin.env

After it succeeds, delete ADMIN_PASSWORD from the Python App env vars and
restart the app.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

BACK_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent

for _p in (str(BACK_DIR), str(SCRIPTS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)


def _load_env_file(path_str):
    """Load env vars from a file BEFORE anything from app.* is imported."""
    path = Path(path_str).expanduser()
    if not path.is_file():
        raise SystemExit(f"ERROR: --env-file not found: {path}")
    from dotenv import load_dotenv
    # utf-8-sig strips a BOM: without it python-dotenv silently drops the
    # first line of a file written by PowerShell Set-Content / Notepad.
    load_dotenv(path, override=True, encoding="utf-8-sig")
    print(f"Loaded environment from {path}")


def _parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Create the single admin account from environment variables."
    )
    parser.add_argument(
        "--env-file",
        default=None,
        metavar="PATH",
        help="load environment variables from this file (python-dotenv syntax) "
             "before importing the app — use it when the shell may have mangled "
             "the values (cron, 'set -a; . file')",
    )
    return parser.parse_args(argv)


_args = _parse_args()
if _args.env_file:
    _load_env_file(_args.env_file)

from create_admin import _min_admin_password_length, _run  # noqa: E402


def main() -> None:
    username = os.environ.get("ADMIN_USERNAME")
    password = os.environ.get("ADMIN_PASSWORD")
    if not username or not password:
        raise SystemExit("Set ADMIN_USERNAME and ADMIN_PASSWORD in the environment first.")
    print(f"APP_ENV = {os.environ.get('APP_ENV', 'development')}")
    print(f"ADMIN_PASSWORD length = {len(password)}")
    if len(password) < _min_admin_password_length():
        print(
            f"HINT: the password is shorter than the policy minimum "
            f"({_min_admin_password_length()} characters). Production requires at "
            "least 12 characters (SRS FR-13), and the value may have been "
            "truncated by the shell — use --env-file to load it from a file."
        )
    sys.exit(asyncio.run(_run(username, password, reset=False)))


if __name__ == "__main__":
    main()
