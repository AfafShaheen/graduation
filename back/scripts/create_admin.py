"""Create or reset the single administrator account (SRS FR-13).

The system has exactly one admin, created directly in the database by the
developer. There is no HTTP endpoint for this on purpose.

Usage (inside the back container):

    # Create admin with custom password (e.g. 0000):
    docker compose exec back python -m scripts.create_admin --username admin --password 0000

    # Reset password if admin already exists:
    docker compose exec back python -m scripts.create_admin --username admin --password 0000 --reset-password
"""

import argparse
import asyncio
import getpass
import os
import sys
from typing import Optional

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.admin import AdminModel

# Development/test allow short passwords (e.g. 0000); production enforces the
# SRS FR-13 minimum of 12 characters.
MIN_ADMIN_PASSWORD_LENGTH = 4
PRODUCTION_MIN_ADMIN_PASSWORD_LENGTH = 12


def _min_admin_password_length() -> int:
    app_env = os.environ.get("APP_ENV", "development").strip().lower()
    if app_env == "production":
        return PRODUCTION_MIN_ADMIN_PASSWORD_LENGTH
    return MIN_ADMIN_PASSWORD_LENGTH


def _read_new_password(provided=None) -> str:
    min_length = _min_admin_password_length()

    # If the value was provided via CLI flag --password, validate and use it.
    if provided:
        if len(provided) < min_length:
            raise SystemExit(
                f"Password must be at least {min_length} characters."
            )
        return provided

    first = getpass.getpass("New admin password: ")
    if len(first) < min_length:
        raise SystemExit(
            f"Password must be at least {min_length} characters."
        )
    second = getpass.getpass("Confirm admin password: ")
    if first != second:
        raise SystemExit("Passwords do not match.")
    return first


async def _run(username: str, password: Optional[str], reset: bool) -> int:
    async with AsyncSessionLocal() as session:
        existing = (await session.execute(select(AdminModel))).scalars().all()

        if reset:
            if not existing:
                print("No admin account found to reset.")
                return 1
            raw = _read_new_password(password)
            existing[0].password_hash = get_password_hash(raw)
            await session.commit()
            print(f"Password updated for admin '{existing[0].username}'.")
            return 0

        if existing:
            print(
                "An admin account already exists. Refusing to create a second one "
                "(SRS FR-13: exactly one admin). Use --reset-password to change its password."
            )
            return 1

        raw = _read_new_password(password)
        session.add(AdminModel(username=username, password_hash=get_password_hash(raw)))
        await session.commit()
        print(f"Admin '{username}' created successfully.")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create or reset the single admin account (SRS FR-13)."
    )
    parser.add_argument("--username", required=True, help="Admin username.")
    parser.add_argument(
        "--password",
        required=False,
        default=None,
        help="Admin password (optional, skips interactive prompt if passed).",
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset the existing admin password instead of creating a new admin.",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(args.username, args.password, args.reset_password)))


if __name__ == "__main__":
    main()