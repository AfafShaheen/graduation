"""Create or reset the single administrator account (SRS FR-13).

The system has exactly one admin, created directly in the database by the
developer. There is no HTTP endpoint for this on purpose.

Usage (inside the back container):

    docker compose exec back python -m scripts.create_admin --username admin
    docker compose exec back python -m scripts.create_admin --username admin --reset-password
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.admin import AdminModel

MIN_ADMIN_PASSWORD_LENGTH = 12


def _read_new_password() -> str:
    first = getpass.getpass("New admin password: ")
    if len(first) < MIN_ADMIN_PASSWORD_LENGTH:
        raise SystemExit(
            f"Password must be at least {MIN_ADMIN_PASSWORD_LENGTH} characters."
        )
    second = getpass.getpass("Confirm admin password: ")
    if first != second:
        raise SystemExit("Passwords do not match.")
    return first


async def _run(username: str, reset: bool) -> int:
    async with AsyncSessionLocal() as session:
        existing = (await session.execute(select(AdminModel))).scalars().all()

        if reset:
            if not existing:
                print("No admin account found to reset.")
                return 1
            raw = _read_new_password()
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

        raw = _read_new_password()
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
        "--reset-password",
        action="store_true",
        help="Reset the existing admin password instead of creating a new admin.",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(args.username, args.reset_password)))


if __name__ == "__main__":
    main()
