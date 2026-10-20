"""Apply database migrations on the cPanel server (no Docker, no shell needed).

Runnable from a laptop, from cPanel's "Execute python script", or from a cron
job (which does NOT see the Python app's env vars — use --env-file there):

    cd back
    python scripts/run_migrations.py
    python scripts/run_migrations.py --env-file /home/USER/graduation_back/.migrate.env

Steps:
  1. Print DATABASE_URL with the password masked.
  2. Print SELECT version(); refuse on PostgreSQL < 13 (gen_random_uuid()
     needs the pgcrypto extension there, which usually needs a superuser).
  3. Detect the database state:
       (a) empty (no public.events, no alembic_version)
           -> execute migrations/0001_init_schema.sql in ONE transaction,
              then `alembic stamp 0001_baseline`;
       (b) tables exist but no alembic_version -> STOP and ask; never guess;
       (c) alembic_version exists -> skip the init SQL.
  4. Run `alembic upgrade head`.
  5. Print the current revision before and after, end with SUCCESS / FAILED.

This script never drops, truncates or downgrades anything.

Notes:
  - The script's own queries use short-lived raw asyncpg connections (one per
    asyncio.run section). The application's pooled ``engine`` is NOT used here:
    pooled asyncpg connections cannot be reused across separate event loops.
  - alembic's env.py runs migrations via asyncio.run(), so the alembic calls
    stay in synchronous context.
"""

import argparse
import asyncio
import sys
from pathlib import Path

BACK_DIR = Path(__file__).resolve().parent.parent
if str(BACK_DIR) not in sys.path:
    sys.path.insert(0, str(BACK_DIR))


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
        description="Apply database migrations (see the module docstring)."
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

import asyncpg  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.core.database import DATABASE_URL  # noqa: E402

INIT_SQL = BACK_DIR / "migrations" / "0001_init_schema.sql"
ALEMBIC_INI = BACK_DIR / "alembic.ini"


def _dsn() -> str:
    """asyncpg DSN built from the same DATABASE_URL the app uses."""
    return make_url(DATABASE_URL).set(drivername="postgresql").render_as_string(
        hide_password=False
    )


def _masked_url() -> str:
    try:
        return make_url(DATABASE_URL).render_as_string(hide_password=True)
    except Exception:
        return DATABASE_URL


def _alembic_config() -> Config:
    cfg = Config(str(ALEMBIC_INI))
    # Resolve script_location absolutely so it works from any current directory.
    cfg.set_main_option("script_location", str(BACK_DIR / "alembic"))
    return cfg


async def _table_exists(conn, table_name: str) -> bool:
    row = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", f"public.{table_name}")
    return bool(row)


async def _current_revision(conn):
    if not await _table_exists(conn, "alembic_version"):
        return None
    return await conn.fetchval("SELECT version_num FROM alembic_version")


def _db_state():
    async def _q():
        conn = await asyncpg.connect(_dsn())
        try:
            version = await conn.fetchval("SELECT version()")
            has_events = await _table_exists(conn, "events")
            has_alembic = await _table_exists(conn, "alembic_version")
            return version, has_events, has_alembic
        finally:
            await conn.close()

    return asyncio.run(_q())


def _revision() -> str:
    async def _q():
        conn = await asyncpg.connect(_dsn())
        try:
            return await _current_revision(conn)
        finally:
            await conn.close()

    rev = asyncio.run(_q())
    return rev or "(none)"


def _apply_init_sql() -> None:
    """Run the pg_dump-style init SQL as ONE transaction."""
    sql_text = INIT_SQL.read_text(encoding="utf-8")

    async def _apply():
        conn = await asyncpg.connect(_dsn())
        try:
            async with conn.transaction():
                await conn.execute(sql_text)
        finally:
            await conn.close()

    asyncio.run(_apply())


def _run() -> int:
    print(f"DATABASE_URL = {_masked_url()}")
    print("")

    version, has_events, has_alembic = _db_state()
    print(f"PostgreSQL version: {version}")
    try:
        major = int(str(version).split()[1].split(".")[0])
    except (IndexError, ValueError):
        print("FAILED: could not parse the PostgreSQL version.")
        return 1
    if major < 13:
        print("")
        print("FAILED: PostgreSQL < 13 is not supported.")
        print("The init SQL uses gen_random_uuid(), which is built in on")
        print("PostgreSQL 13+ but needs the pgcrypto extension on <= 12.")
        print("Ask support to run:  CREATE EXTENSION pgcrypto;")
        print("then re-run this script.")
        return 1

    print("")
    if has_events and not has_alembic:
        print("FAILED: the database has tables (public.events) but no alembic_version table.")
        print("I will not guess which schema state this is.")
        print("Ask the developer before continuing.")
        return 1

    if not has_events and not has_alembic:
        print("Empty database: applying migrations/0001_init_schema.sql in one transaction ...")
        _apply_init_sql()
        print("Init SQL applied. Stamping 0001_baseline ...")
        command.stamp(_alembic_config(), "0001_baseline")
    else:
        print("alembic_version present: skipping the init SQL.")

    print(f"Current revision before: {_revision()}")

    print("Running alembic upgrade head ...")
    command.upgrade(_alembic_config(), "head")

    print(f"Current revision after:  {_revision()}")
    print("")
    print("SUCCESS")
    return 0


def main() -> None:
    try:
        sys.exit(_run())
    except Exception as exc:
        print("")
        msg = str(exc)
        if "permission denied for schema public" in msg:
            print("FAILED: permission denied for schema public.")
            print("Fix it via phpPgAdmin as the database owner (or ask support):")
            print("")
            print("    GRANT ALL ON SCHEMA public TO sunionhomsuni_graduation_user;")
            print("")
            print("Then re-run this script.")
        else:
            print(f"FAILED: {msg}")
        sys.exit(1)


if __name__ == "__main__":
    main()
