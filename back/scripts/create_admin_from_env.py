"""Create the single admin account from environment variables (cPanel).

The interactive ``create_admin.py`` cannot run from cPanel's "Execute python
script" button (there is no terminal to type the password into). This variant
reads ADMIN_USERNAME and ADMIN_PASSWORD from the environment, reuses the exact
same creation logic, validates the password with the same policy, and never
prints the password.

Usage (cPanel "Execute python script", after setting the two env vars):

    python scripts/create_admin_from_env.py

After it succeeds, delete ADMIN_PASSWORD from the Python App env vars and
restart the app.
"""

import asyncio
import os
import sys
from pathlib import Path

BACK_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent

sys.path.insert(0, str(BACK_DIR))
sys.path.insert(0, str(SCRIPTS_DIR))

from create_admin import _run


def main() -> None:
    username = os.environ.get("ADMIN_USERNAME")
    password = os.environ.get("ADMIN_PASSWORD")
    if not username or not password:
        raise SystemExit("Set ADMIN_USERNAME and ADMIN_PASSWORD in the environment first.")
    sys.exit(asyncio.run(_run(username, password, reset=False)))


if __name__ == "__main__":
    main()
