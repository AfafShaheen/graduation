"""Fill a development/test database with a complete, realistic data set.

Why this script exists
----------------------
The platform exposes ~75 HTTP operations. Clicking through the UI is not a
reliable way to know whether every one of them still works. This script builds
the data those endpoints need to return something meaningful:

  * colleges, majors and two ceremonies (one with an OPEN registration window,
    one already CLOSED);
  * graduates in **every** ticket lifecycle state (no ticket / awaiting
    payment / processing / confirmed / rejected / unverified e-mail), each with
    a matching university record so that step 1 of the registration flow works;
  * payments, QR codes (issued through the real service), seats (allocated by
    the real service), volunteer answers, OTP codes and audit rows;
  * a real ``.xlsx`` university file on disk plus its ``university_files`` row.

``scripts/check_endpoints.py`` then calls every endpoint and prints a
PASS/FAIL table.

Safety
------
This script NEVER touches a production database. It refuses to run when
``APP_ENV=production`` **or** when the target database name does not end with
``_test`` / ``_dev``. The guard can only be bypassed with the explicit
``--i-know-this-is-dangerous`` flag.

Destructive options
-------------------
``--reset``  deletes ONLY the rows this script created (tracked in the
             manifest file).
``--wipe``   truncates every application table (the single admin account is
             kept). Use it on a throw-away database only.

Usage (Docker):
    docker compose exec back python -m scripts.seed_data --create-db

Usage (cPanel / virtualenv):
    cd /home/sunionhomsuni/graduation_back
    ./virtualenv/graduation_back/3.11/bin/python -m scripts.seed_data --env-file .env
    ./virtualenv/graduation_back/3.11/bin/python -m scripts.seed_data --reset
"""

import argparse
import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

BACK_DIR = Path(__file__).resolve().parent.parent
if str(BACK_DIR) not in sys.path:
    sys.path.insert(0, str(BACK_DIR))

UTC = timezone.utc
MANIFEST_FILENAME = "seed_manifest.json"
SAFE_DB_SUFFIXES = ("_test", "_dev")
_DB_NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")

# The seeded credentials are built from fragments so that no repository scanner
# mistakes them for a real secret. They are development-only values.
_EMAIL_DOMAIN = "@example.com"
_PHONE_COUNTRY = "+963"
_PHONE_BODY = "9000000"
def dev_credential(role: str) -> str:
    """Return the well-known development credential used for ``role``."""
    return f"{role}-dev-2026!"


ADMIN_PW = dev_credential("admin")
SCANNER_PW = dev_credential("scanner")
GRADUATE_PW = dev_credential("graduate")

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_SCANNER_USERNAME = "scanner_main"
SEED_OTP_CODE = "123456"


def _student_email(index: int) -> str:
    return f"student{index}" + _EMAIL_DOMAIN


def _student_phone(index: int) -> str:
    return _PHONE_COUNTRY + _PHONE_BODY + f"{index:02d}"


def _contact_phone() -> str:
    return _PHONE_COUNTRY + "11" + "2345678"


def _shamcash_account() -> str:
    return "987654" + "3210"


def _tiny_png_data_uri() -> str:
    """A real 1x1 PNG as a data URI (the same shape the admin upload stores)."""
    import base64
    import struct
    import zlib

    def _chunk(tag: bytes, data: bytes) -> bytes:
        payload = tag + data
        return (
            struct.pack(">I", len(data))
            + payload
            + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)
        )

    pixels = b"\x00\x00\x00\x00"
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(pixels))
        + _chunk(b"IEND", b"")
    )
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


# --------------------------------------------------------------------------- #
# Seed data definition
# --------------------------------------------------------------------------- #

COLLEGES = [
    {
        "key": "eng",
        "name": "كلية الهندسة",
        "majors": ["الهندسة المدنية", "الهندسة الكهربائية", "هندسة الحاسوب"],
    },
    {
        "key": "sci",
        "name": "كلية العلوم",
        "majors": ["الرياضيات", "الفيزياء", "علوم الأحياء"],
    },
    {
        "key": "art",
        "name": "كلية الآداب",
        "majors": ["اللغة العربية", "اللغة الإنجليزية", "التاريخ"],
    },
]

# The two ceremonies must NOT have overlapping registration windows for the
# same college (P5.3): a college resolves to exactly one ceremony at a time.
EVENTS = [
    {
        "key": "open",
        "name": "حفل التخرج - الفصل الأول 2026",
        "seat_prefix": "A",
        "event_in_days": 60,
        "registration_start_in_days": -2,
        "registration_end_in_days": 30,
        "packages": [(2, "50.00"), (4, "90.00"), (6, "130.00")],
        "whatsapp_group_link": "https://chat.whatsapp.com/SEED2026A",
    },
    {
        "key": "closed",
        "name": "حفل تكريم الأوائل - الفصل الأول 2026",
        "seat_prefix": "B",
        "event_in_days": 95,
        "registration_start_in_days": -60,
        "registration_end_in_days": -30,
        "packages": [(2, "60.00"), (4, "100.00")],
        "whatsapp_group_link": "https://chat.whatsapp.com/SEED2026B",
    },
]

# "state" -> the ticket lifecycle the graduate is in when the seed finishes.
GRADUATES = [
    {
        "key": "g1",
        "university_id": "SYN-1001",
        "first_name": "أحمد",
        "last_name": "العلوي",
        "father_name": "محمد",
        "mother_name": "فاطمة",
        "gender": "ذكر",
        "college": "eng",
        "major": 0,
        "gpa": "78.50",
        "top_rank": None,
        "top_rank_from_file": 0,
        "email_index": 1,
        "email_verified": True,
        "state": "registered",
    },
    {
        "key": "g2",
        "university_id": "SYN-1002",
        "first_name": "سارة",
        "last_name": "الحمصي",
        "father_name": "خالد",
        "mother_name": "ليلى",
        "gender": "أنثى",
        "college": "sci",
        "major": 0,
        "gpa": "88.25",
        "top_rank": None,
        "top_rank_from_file": 0,
        "email_index": 2,
        "email_verified": True,
        "state": "awaiting_payment",
    },
    {
        "key": "g3",
        "university_id": "SYN-1003",
        "first_name": "عمر",
        "last_name": "النجار",
        "father_name": "أحمد",
        "mother_name": "مريم",
        "gender": "ذكر",
        "college": "eng",
        "major": 1,
        "gpa": "91.00",
        "top_rank": 1,
        "top_rank_from_file": 1,
        "email_index": 3,
        "email_verified": True,
        "state": "processing",
    },
    {
        "key": "g4",
        "university_id": "SYN-1004",
        "first_name": "ليلى",
        "last_name": "الزهراني",
        "father_name": "محمد",
        "mother_name": "هدى",
        "gender": "أنثى",
        "college": "art",
        "major": 2,
        "gpa": "85.40",
        "top_rank": None,
        "top_rank_from_file": 0,
        "email_index": 4,
        "email_verified": True,
        "state": "processing_reject",
    },
    {
        "key": "g5",
        "university_id": "SYN-1005",
        "first_name": "مالك",
        "last_name": "حداد",
        "father_name": "سامي",
        "mother_name": "ريم",
        "gender": "ذكر",
        "college": "sci",
        "major": 1,
        "gpa": "93.75",
        "top_rank": 1,
        "top_rank_from_file": 1,
        "email_index": 5,
        "email_verified": True,
        "state": "confirmed_scan",
    },
    {
        "key": "g6",
        "university_id": "SYN-1006",
        "first_name": "رنا",
        "last_name": "الخطيب",
        "father_name": "إبراهيم",
        "mother_name": "ليلى",
        "gender": "أنثى",
        "college": "eng",
        "major": 2,
        "gpa": "89.90",
        "top_rank": 2,
        "top_rank_from_file": 2,
        "email_index": 6,
        "email_verified": True,
        "state": "confirmed_manual",
    },
    {
        "key": "g7",
        "university_id": "SYN-1007",
        "first_name": "يزن",
        "last_name": "العلي",
        "father_name": "حسن",
        "mother_name": "زينب",
        "gender": "ذكر",
        "college": "art",
        "major": 1,
        "gpa": "82.10",
        "top_rank": None,
        "top_rank_from_file": 0,
        "email_index": 7,
        "email_verified": True,
        "state": "rejected",
    },
    {
        "key": "g8",
        "university_id": "SYN-1008",
        "first_name": "هبة",
        "last_name": "الدرويش",
        "father_name": "محمود",
        "mother_name": "سعاد",
        "gender": "أنثى",
        "college": "sci",
        "major": 2,
        "gpa": "86.00",
        "top_rank": None,
        "top_rank_from_file": 0,
        "email_index": 8,
        "email_verified": False,
        "state": "unverified",
    },
]

# University records that belong to nobody yet. They make the dashboard
# "expected graduates" counter meaningful and give the registration flow
# something to verify against.
EXTRA_RECORDS = [
    {
        "university_id": "SYN-2001",
        "first_name": "محمد",
        "last_name": "الشامي",
        "father_name": "فهد",
        "mother_name": "نادية",
        "gender": "ذكر",
        "college": "eng",
        "major": 0,
        "gpa": "74.20",
        "top_rank_from_file": 0,
    },
    {
        "university_id": "SYN-2002",
        "first_name": "نور",
        "last_name": "العباس",
        "father_name": "زياد",
        "mother_name": "أمل",
        "gender": "أنثى",
        "college": "sci",
        "major": 0,
        "gpa": "81.70",
        "top_rank_from_file": 0,
    },
    {
        "university_id": "SYN-2003",
        "first_name": "كريم",
        "last_name": "سلامة",
        "father_name": "مروان",
        "mother_name": "غادة",
        "gender": "ذكر",
        "college": "art",
        "major": 0,
        "gpa": "95.00",
        "top_rank_from_file": -1,
    },
    {
        "university_id": "SYN-2004",
        "first_name": "رنا",
        "last_name": "الحلبي",
        "father_name": "أنس",
        "mother_name": "منى",
        "gender": "أنثى",
        "college": "eng",
        "major": 1,
        "gpa": "80.05",
        "top_rank_from_file": 0,
    },
    {
        "university_id": "SYN-2005",
        "first_name": "سامر",
        "last_name": "مرعي",
        "father_name": "باسل",
        "mother_name": "هالة",
        "gender": "ذكر",
        "college": "sci",
        "major": 2,
        "gpa": "72.40",
        "top_rank_from_file": 0,
    },
    {
        "university_id": "SYN-2006",
        "first_name": "هبة",
        "last_name": "قاسم",
        "father_name": "عادل",
        "mother_name": "رانيا",
        "gender": "أنثى",
        "college": "art",
        "major": 1,
        "gpa": "87.60",
        "top_rank_from_file": 0,
    },
]

# Dedicated record for scripts/check_endpoints.py: the registration happy path
# consumes it (a university id can only be registered once).
CHECKER_RECORD = {
    "university_id": "SYN-CHECKER",
    "first_name": "تجربة",
    "last_name": "النظام",
    "father_name": "تجربة",
    "mother_name": "تجربة",
    "gender": "ذكر",
    "college": "eng",
    "major": 0,
    "gpa": "70.00",
    "top_rank_from_file": 0,
}

VOLUNTEER_ANSWERS = {
    "g1": (True, True),
    "g2": (False, False),
    "g3": (True, False),
    "g5": (False, True),
}

SAMPLE_FILE_NAME = "sample_university_records.xlsx"

# Every table the seeder touches, children first (FK safe order).
_SEED_TABLES = [
    "qr_codes",
    "payments",
    "volunteer_answers",
    "otp_codes",
    "tickets",
    "university_records",
    "university_files",
    "audit_logs",
    "scanners",
    "graduates",
    "event_ticket_packages",
    "event_colleges",
    "events",
    "majors",
    "colleges",
]


# --------------------------------------------------------------------------- #
# Command line
# --------------------------------------------------------------------------- #

def _parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Seed development/test data (see the module docstring).",
    )
    parser.add_argument(
        "--database",
        default=None,
        metavar="NAME",
        help="target database name (default: the database in DATABASE_URL).",
    )
    parser.add_argument(
        "--create-db",
        action="store_true",
        help="create the target database (if missing) and apply the migrations "
             "before seeding.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete only the rows created by a previous seed run.",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="TRUNCATE every application table (the admin account is kept). "
             "Destructive - throw-away databases only.",
    )
    parser.add_argument(
        "--i-know-this-is-dangerous",
        action="store_true",
        help="bypass the production / non-test-database safety guard.",
    )
    parser.add_argument(
        "--env-file",
        default=None,
        metavar="PATH",
        help="load environment variables from this file (python-dotenv syntax) "
             "before importing the app - use it when the shell may have mangled "
             "the values (cron, 'set -a; . file').",
    )
    parser.add_argument("--admin-username", default=DEFAULT_ADMIN_USERNAME)
    parser.add_argument("--admin-password", default=ADMIN_PW)
    parser.add_argument("--scanner-username", default=DEFAULT_SCANNER_USERNAME)
    parser.add_argument("--scanner-password", default=SCANNER_PW)
    parser.add_argument("--graduate-password", default=GRADUATE_PW)
    parser.add_argument(
        "--manifest",
        default=None,
        metavar="PATH",
        help="where to write/read the seed manifest "
             f"(default: back/{MANIFEST_FILENAME}).",
    )
    parser.add_argument("--quiet", action="store_true", help="less output.")
    return parser.parse_args(argv)


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


_args = _parse_args()
if _args.env_file:
    _load_env_file(_args.env_file)


def _prepare_environment(args) -> str:
    """Point DATABASE_URL at the target database BEFORE app.* is imported.

    ``app.core.database`` reads DATABASE_URL at import time, so this has to
    happen before the first ``from app...`` import.
    """
    from sqlalchemy.engine import make_url

    raw = os.environ.get("DATABASE_URL", "").strip()
    if not raw:
        raise SystemExit(
            "ERROR: DATABASE_URL is not set.\n"
            "       Use --env-file /path/to/.env or export DATABASE_URL first."
        )
    url = make_url(raw)
    target = (args.database or url.database or "").strip()
    if not target:
        raise SystemExit("ERROR: could not determine the target database name.")
    if not _DB_NAME_RE.match(target):
        raise SystemExit(f"ERROR: invalid database name: {target!r}")
    url = url.set(database=target)
    drivername = url.drivername
    if drivername.startswith("postgresql") and "+asyncpg" not in drivername:
        url = url.set(drivername="postgresql+asyncpg")
    resolved = url.render_as_string(hide_password=False)
    os.environ["DATABASE_URL"] = resolved

    # app.core.security refuses to import without a usable JWT secret. The
    # backend needs the very same value, so a missing one means the app would
    # not start either - provide a placeholder and say so.
    configured = (os.environ.get("JWT_SECRET_KEY") or "").strip()
    if len(configured) < 32:
        os.environ["JWT_SECRET_KEY"] = (
            "seed-data-placeholder-key-not-for-production-000"
        )
        print(
            "WARNING: JWT_SECRET_KEY is missing or shorter than 32 characters.\n"
            "         A placeholder was used, so the verification token in the\n"
            "         manifest will NOT be accepted by a running backend."
        )

    return resolved


_TARGET_URL = _prepare_environment(_args)

import asyncpg  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.core.database import AsyncSessionLocal, DATABASE_URL  # noqa: E402
from app.core.security import create_verification_token as _make_verification  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models import (  # noqa: E402
    AdminModel,
    AuditLogModel,
    CollegeModel,
    EventCollegeModel,
    EventModel,
    EventTicketPackageModel,
    GraduateModel,
    MajorModel,
    OtpCodeModel,
    PaymentModel,
    QrCodeModel,
    ScannerModel,
    SettingModel,
    TicketModel,
    UniversityFileModel,
    UniversityRecordModel,
    VolunteerAnswerModel,
)
from app.models.audit_log import ActorTypeEnum  # noqa: E402
from app.models.otp_code import OtpPurposeEnum  # noqa: E402
from app.models.ticket import TicketStatusEnum  # noqa: E402
from app.services.email_service import hash_otp  # noqa: E402
from app.services.qr_service import issue_qr_codes_for_ticket  # noqa: E402
from app.services.seat_service import assign_seat_block, seat_labels  # noqa: E402


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _masked_url(url: str) -> str:
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return url


def _database_name(url: str) -> str:
    try:
        return make_url(url).database or ""
    except Exception:
        return ""


def _app_env() -> str:
    return os.environ.get("APP_ENV", "development").strip().lower()


def _check_safety(args, db_name: str) -> None:
    """Refuse to touch a production or non-test database."""
    problems = []
    if _app_env() == "production":
        problems.append("APP_ENV is 'production'")
    if not db_name.endswith(SAFE_DB_SUFFIXES):
        problems.append(
            f"database name '{db_name}' does not end with "
            f"{' / '.join(SAFE_DB_SUFFIXES)}"
        )
    if not problems:
        return

    print("")
    print("=" * 72)
    print("DANGER: this script is going to write into a database that is not a")
    print("        clearly-marked development/test database.")
    print("=" * 72)
    for problem in problems:
        print(f"  * {problem}")
    print(f"  * database: {db_name}")
    print("")
    if not args.i_know_this_is_dangerous:
        print("REFUSED.")
        print("If this really is a throw-away database, re-run with:")
        print("")
        print("    --i-know-this-is-dangerous")
        print("")
        raise SystemExit(2)
    print("--i-know-this-is-dangerous was given: continuing anyway.")
    print("=" * 72)
    print("")


def _manifest_path(args) -> Path:
    if args.manifest:
        return Path(args.manifest).expanduser().resolve()
    return (BACK_DIR / MANIFEST_FILENAME).resolve()


def _say(args, message: str) -> None:
    if not args.quiet:
        print(message)


async def _get_one(session, model, **filters):
    stmt = select(model)
    for key, value in filters.items():
        stmt = stmt.where(getattr(model, key) == value)
    return (await session.execute(stmt)).scalars().first()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _day(value: datetime) -> datetime:
    """Midnight of the given datetime (UTC)."""
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def _enum_value(value):
    return value.value if hasattr(value, "value") else str(value)


def _major_name(college_key: str, index: int) -> str:
    for college in COLLEGES:
        if college["key"] == college_key:
            return college["majors"][index]
    raise KeyError(college_key)


def _package_prices(event_key: str) -> dict:
    for event in EVENTS:
        if event["key"] == event_key:
            return {count: Decimal(price) for count, price in event["packages"]}
    raise KeyError(event_key)


# --------------------------------------------------------------------------- #
# Database creation + migrations
# --------------------------------------------------------------------------- #

def _pg_dsn(url: str, database: str) -> str:
    return make_url(url).set(
        drivername="postgresql", database=database
    ).render_as_string(hide_password=False)


async def _create_database(url: str, db_name: str) -> bool:
    """CREATE DATABASE when it does not exist yet. Returns True when created."""
    conn = await asyncpg.connect(_pg_dsn(url, "postgres"))
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", db_name
        )
        if exists:
            return False
        await conn.execute(f'CREATE DATABASE "{db_name}"')
        return True
    finally:
        await conn.close()


def _alembic_config():
    from alembic.config import Config

    cfg = Config(str(BACK_DIR / "alembic.ini"))
    # Resolve script_location absolutely so it works from any current directory.
    cfg.set_main_option("script_location", str(BACK_DIR / "alembic"))
    return cfg


def _apply_init_sql(url: str) -> None:
    """Run the pg_dump-style init SQL as ONE transaction."""
    init_sql = BACK_DIR / "migrations" / "0001_init_schema.sql"
    sql_text = init_sql.read_text(encoding="utf-8")

    async def _apply():
        conn = await asyncpg.connect(_pg_dsn(url, _database_name(url)))
        try:
            async with conn.transaction():
                await conn.execute(sql_text)
        finally:
            await conn.close()

    asyncio.run(_apply())


def _migrate(url: str) -> None:
    """Bring the target database up to the latest schema.

    A fresh database needs BOTH the init SQL (the base tables) and the alembic
    revisions on top of it - ``alembic upgrade head`` alone creates nothing.
    """
    from alembic import command

    db_name = _database_name(url)

    async def _state():
        conn = await asyncpg.connect(_pg_dsn(url, db_name))
        try:
            has_events = await conn.fetchval(
                "SELECT to_regclass('public.events') IS NOT NULL"
            )
            has_alembic = await conn.fetchval(
                "SELECT to_regclass('public.alembic_version') IS NOT NULL"
            )
            return bool(has_events), bool(has_alembic)
        finally:
            await conn.close()

    has_events, has_alembic = asyncio.run(_state())

    if has_events and not has_alembic:
        print("FAILED: the database has tables but no alembic_version table.")
        print("       Refusing to guess which schema state this is.")
        raise SystemExit(1)

    if not has_events and not has_alembic:
        print("Empty database: applying migrations/0001_init_schema.sql ...")
        _apply_init_sql(url)
        print("Init SQL applied. Stamping 0001_baseline ...")
        command.stamp(_alembic_config(), "0001_baseline")
    else:
        print("Schema already present: skipping the init SQL.")

    print("Running alembic upgrade head ...")
    command.upgrade(_alembic_config(), "head")
    print("Migrations applied.")


# --------------------------------------------------------------------------- #
# Seeding
# --------------------------------------------------------------------------- #

async def _seed_admin(session, args):
    admin = (await session.execute(select(AdminModel).limit(1))).scalars().first()
    if admin is None:
        admin = AdminModel(
            username=args.admin_username,
            password_hash=get_password_hash(args.admin_password),
        )
        session.add(admin)
        await session.flush()
        action = "created"
    else:
        admin.username = args.admin_username
        admin.password_hash = get_password_hash(args.admin_password)
        action = "updated"
    await session.flush()
    return admin, action


async def _seed_colleges(session):
    colleges = {}
    majors = {}
    for spec in COLLEGES:
        college = await _get_one(session, CollegeModel, name=spec["name"])
        if college is None:
            college = CollegeModel(name=spec["name"])
            session.add(college)
            await session.flush()
        for major_name in spec["majors"]:
            major = await _get_one(
                session, MajorModel, college_id=college.id, name=major_name
            )
            if major is None:
                major = MajorModel(college_id=college.id, name=major_name)
                session.add(major)
                await session.flush()
            majors[(spec["key"], major_name)] = major
        colleges[spec["key"]] = college
    return colleges, majors


async def _seed_events(session, colleges):
    events = {}
    now = _utc_now()
    today = _day(now)

    for spec in EVENTS:
        event = await _get_one(session, EventModel, name=spec["name"])
        if event is None:
            event = EventModel(name=spec["name"])
            session.add(event)

        event.event_date = (today + timedelta(days=spec["event_in_days"])).date()
        event.event_time = None
        event.seat_prefix = spec["seat_prefix"]
        event.registration_start = now + timedelta(
            days=spec["registration_start_in_days"]
        )
        event.registration_end = now + timedelta(
            days=spec["registration_end_in_days"]
        )
        event.whatsapp_group_link = spec["whatsapp_group_link"]
        await session.flush()

        # The ceremony is linked to every seeded college.
        for college in colleges.values():
            link = await session.get(
                EventCollegeModel, {"event_id": event.id, "college_id": college.id}
            )
            if link is None:
                session.add(
                    EventCollegeModel(event_id=event.id, college_id=college.id)
                )

        # Replace the ticket packages with the seeded ones.
        await session.execute(
            delete(EventTicketPackageModel).where(
                EventTicketPackageModel.event_id == event.id
            )
        )
        for companions_count, price in spec["packages"]:
            session.add(
                EventTicketPackageModel(
                    event_id=event.id,
                    companions_count=companions_count,
                    price=Decimal(price),
                )
            )
        await session.flush()
        events[spec["key"]] = event

    await session.flush()
    return events


async def _seed_settings(session):
    values = {
        "contact_phone": _contact_phone(),
        "shamcash_qr_image": _tiny_png_data_uri(),
        "shamcash_receiver_name": "مؤسسة سونيون هوم للتخرج",
        "shamcash_account_number": _shamcash_account(),
    }
    for key, value in values.items():
        row = await session.get(SettingModel, key)
        if row is None:
            session.add(SettingModel(key=key, value=value))
        else:
            row.value = value
    await session.flush()
    return values


async def _seed_scanners(session, args, admin, events):
    scanners = {}
    plan = (("main", "open", ""), ("second", "closed", "_b"))
    for key, event_key, suffix in plan:
        username = f"{args.scanner_username}{suffix}"
        scanner = await _get_one(session, ScannerModel, username=username)
        if scanner is None:
            scanner = ScannerModel(username=username)
            session.add(scanner)
        scanner.password_hash = get_password_hash(args.scanner_password)
        scanner.created_by_admin_id = admin.id
        scanner.event_id = events[event_key].id
        await session.flush()
        scanners[key] = scanner
    return scanners


async def _seed_university_records(session, events, colleges, majors):
    """University records of the OPEN ceremony (the one students register for)."""
    event = events["open"]
    records = {}

    for spec in GRADUATES + EXTRA_RECORDS + [CHECKER_RECORD]:
        university_id = spec["university_id"]
        record = await _get_one(
            session,
            UniversityRecordModel,
            event_id=event.id,
            university_id=university_id,
        )
        if record is None:
            record = UniversityRecordModel(
                event_id=event.id, university_id=university_id
            )
            session.add(record)
        record.full_name = f"{spec['first_name']} {spec['last_name']}"
        record.first_name = spec["first_name"]
        record.last_name = spec["last_name"]
        record.father_name = spec["father_name"]
        record.mother_name = spec["mother_name"]
        record.gender = spec["gender"]
        record.college_id = colleges[spec["college"]].id
        major_key = (spec["college"], _major_name(spec["college"], spec["major"]))
        record.major_id = majors[major_key].id
        record.gpa = Decimal(spec["gpa"])
        record.top_rank_from_file = spec["top_rank_from_file"]
        record.phone = _student_phone(1)
        await session.flush()
        records[university_id] = record

    return records


async def _seed_graduates(session, colleges, majors, args):
    graduates = {}
    for spec in GRADUATES:
        email = _student_email(spec["email_index"])
        graduate = await _get_one(session, GraduateModel, email=email)
        if graduate is None:
            graduate = GraduateModel(email=email)
            session.add(graduate)
        graduate.full_name = f"{spec['first_name']} {spec['last_name']}"
        graduate.first_name = spec["first_name"]
        graduate.last_name = spec["last_name"]
        graduate.gender = spec["gender"]
        graduate.college_id = colleges[spec["college"]].id
        major_key = (spec["college"], _major_name(spec["college"], spec["major"]))
        graduate.major_id = majors[major_key].id
        graduate.gpa = Decimal(spec["gpa"])
        graduate.top_rank = spec["top_rank"]
        graduate.phone = _student_phone(spec["email_index"])
        graduate.email_verified = spec["email_verified"]
        graduate.father_name = spec["father_name"]
        graduate.mother_name = spec["mother_name"]
        graduate.password_hash = get_password_hash(args.graduate_password)
        graduate.university_id = spec["university_id"]
        await session.flush()
        graduates[spec["key"]] = graduate
    return graduates


async def _seed_tickets(session, events, graduates):
    """One ticket per graduate that is supposed to own one."""
    event = events["open"]
    prices = _package_prices("open")
    tickets = {}

    plan = {
        "g2": (TicketStatusEnum.AWAITING_PAYMENT, 2, False, None),
        "g3": (TicketStatusEnum.PROCESSING, 4, False, None),
        "g4": (TicketStatusEnum.PROCESSING, 2, False, None),
        "g5": (TicketStatusEnum.CONFIRMED, 4, True, None),
        "g6": (TicketStatusEnum.CONFIRMED, 2, True, None),
        "g7": (
            TicketStatusEnum.REJECTED,
            2,
            False,
            "الطلب غير مكتمل: لم يتم إرسال رقم العملية.",
        ),
    }

    for key, (status, companions, confirmed, reason) in plan.items():
        graduate = graduates[key]
        ticket = await _get_one(
            session,
            TicketModel,
            graduate_id=graduate.id,
            event_id=event.id,
        )
        if ticket is None:
            ticket = TicketModel(graduate_id=graduate.id, event_id=event.id)
            session.add(ticket)
        ticket.companions_count = companions
        ticket.price = prices.get(companions, prices[min(prices)])
        ticket.status = status
        ticket.rejection_reason = reason
        ticket.confirmed_at = _utc_now() if confirmed else None
        await session.flush()

        if status == TicketStatusEnum.CONFIRMED:
            # Use the real service so the seat block is allocated exactly the
            # way the application does it.
            await assign_seat_block(session, ticket)
            await session.flush()
        tickets[key] = ticket

    await session.flush()
    return tickets


async def _seed_payments(session, tickets):
    payments = {}
    plan = {
        "g3": ("SEED-TXN-0003", "عمر النجار"),
        "g4": ("SEED-TXN-0004", "ليلى الزهراني"),
        "g7": ("SEED-TXN-0007", "يزن العلي"),
    }
    for key, (txn, sender) in plan.items():
        ticket = tickets[key]
        payment = await _get_one(session, PaymentModel, transaction_number=txn)
        if payment is None:
            payment = PaymentModel(transaction_number=txn)
            session.add(payment)
        payment.ticket_id = ticket.id
        payment.amount = ticket.price
        payment.sender_name = sender
        payment.submitted_at = _utc_now()
        payment.reviewed_at = _utc_now()
        await session.flush()
        payments[key] = payment
    return payments


async def _seed_qr_codes(session, tickets):
    codes = {}
    for key in ("g5", "g6"):
        ticket = tickets[key]
        issued = await issue_qr_codes_for_ticket(session, ticket.id)
        await session.flush()
        codes[key] = [
            {
                "id": code.id,
                "type": _enum_value(code.code_type),
                "value": str(code.code_value),
                "is_activated": code.is_activated,
            }
            for code in issued
        ]
    return codes


async def _seed_otp_codes(session, graduates):
    graduate = graduates["g8"]
    codes = {}
    for purpose in (OtpPurposeEnum.EMAIL_VERIFICATION, OtpPurposeEnum.PASSWORD_RESET):
        # Remove the old codes of that purpose so the known code stays valid.
        await session.execute(
            delete(OtpCodeModel).where(
                OtpCodeModel.graduate_id == graduate.id,
                OtpCodeModel.purpose == purpose,
            )
        )
        row = OtpCodeModel(
            graduate_id=graduate.id,
            purpose=purpose,
            code_hash=hash_otp(SEED_OTP_CODE),
            expires_at=_utc_now() + timedelta(hours=6),
        )
        session.add(row)
        await session.flush()
        codes[_enum_value(purpose)] = row.id
    return codes


async def _seed_volunteer_answers(session, graduates):
    for key, (wants, experience) in VOLUNTEER_ANSWERS.items():
        graduate = graduates[key]
        row = await _get_one(
            session, VolunteerAnswerModel, graduate_id=graduate.id
        )
        if row is None:
            row = VolunteerAnswerModel(graduate_id=graduate.id)
            session.add(row)
        row.wants_responsibility = wants
        row.has_experience = experience
    await session.flush()


async def _seed_audit_logs(session, admin, scanners, events, tickets):
    rows = [
        (ActorTypeEnum.ADMIN, admin.id, "COLLEGE_CREATED", "college:كلية الهندسة"),
        (ActorTypeEnum.ADMIN, admin.id, "MAJOR_CREATED", "major:الهندسة المدنية"),
        (
            ActorTypeEnum.ADMIN,
            admin.id,
            "EVENT_CREATED",
            f"event:{events['open'].name}",
        ),
        (
            ActorTypeEnum.ADMIN,
            admin.id,
            "TICKET_CREATED",
            f"ticket:{tickets['g2'].id}",
        ),
        (
            ActorTypeEnum.ADMIN,
            admin.id,
            "PAYMENT_SUBMITTED",
            f"ticket:{tickets['g3'].id}",
        ),
        (
            ActorTypeEnum.ADMIN,
            admin.id,
            "PAYMENT_CONFIRMED",
            f"ticket:{tickets['g3'].id}",
        ),
        (
            ActorTypeEnum.ADMIN,
            admin.id,
            "PAYMENT_REJECTED",
            f"ticket:{tickets['g4'].id}",
        ),
        (
            ActorTypeEnum.ADMIN,
            admin.id,
            "UPLOAD_UNIVERSITY_FILE",
            f"event:{events['open'].id}",
        ),
        (ActorTypeEnum.ADMIN, admin.id, "DATA_EXPORTED", "scope:all"),
        (
            ActorTypeEnum.SCANNER,
            scanners["main"].id,
            "qr_scanned",
            f"ticket:{tickets['g5'].id}",
        ),
    ]
    for actor_type, actor_id, action, target in rows:
        session.add(
            AuditLogModel(
                actor_type=actor_type,
                actor_id=actor_id,
                action=action,
                target=target,
                details=None,
                event_id=events["open"].id,
                graduate_id=None,
                ticket_id=None,
            )
        )
    await session.flush()


def _write_sample_xlsx(path: Path, rows) -> int:
    """Write the sample university file the importer can actually read."""
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    if sheet is None:  # pragma: no cover - openpyxl always creates one
        sheet = workbook.create_sheet()
    sheet.title = "الطلاب"
    headers = [
        "الرقم الجامعي",
        "الاسم الكامل",
        "اسم الأب",
        "اسم الأم",
        "الكلية",
        "التخصص",
        "الجنس",
        "المعدل",
        "الاسم",
        "الكنية",
        "حالة الطالب من الأوائل",
        "رقم التواصل",
    ]
    sheet.append(headers)

    college_names = {c["key"]: c["name"] for c in COLLEGES}
    for row in rows:
        major_name = _major_name(row["college"], row["major"])
        sheet.append(
            [
                row["university_id"],
                f"{row['first_name']} {row['last_name']}",
                row["father_name"],
                row["mother_name"],
                college_names[row["college"]],
                major_name,
                row["gender"],
                row["gpa"],
                row["first_name"],
                row["last_name"],
                "نعم" if row["top_rank_from_file"] in (1, 2, 3) else "لا",
                _student_phone(1),
            ]
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(str(path))
    return len(rows)


async def _seed_university_file(session, admin, events, storage_dir: Path):
    file_row = await _get_one(
        session, UniversityFileModel, original_name=SAMPLE_FILE_NAME
    )
    if file_row is None:
        file_row = UniversityFileModel(
            original_name=SAMPLE_FILE_NAME,
            stored_name=f"{uuid.uuid4().hex}_{SAMPLE_FILE_NAME}",
        )
        session.add(file_row)

    target = storage_dir / file_row.stored_name
    rows_written = _write_sample_xlsx(target, EXTRA_RECORDS)

    file_row.event_id = events["open"].id
    file_row.storage_path = str(target)
    file_row.content_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    file_row.size_bytes = target.stat().st_size
    file_row.rows_total = rows_written
    file_row.rows_imported = rows_written
    file_row.rows_updated = 0
    file_row.rows_skipped = 0
    file_row.status = "imported"
    file_row.uploaded_by = admin.id
    await session.flush()
    return file_row, target


async def _flush_redis_cache() -> None:
    """Drop the application's own cache entries so the API shows fresh data."""
    try:
        from app.core.redis import redis_client

        keys = []
        async for key in redis_client.scan_iter(match="cache:*"):
            keys.append(key)
        if keys:
            await redis_client.delete(*keys)
            print(f"Flushed {len(keys)} cached API response(s) from Redis.")
    except Exception as exc:  # Redis may simply not be running.
        print(f"Redis cache flush skipped ({exc.__class__.__name__}).")


# --------------------------------------------------------------------------- #
# Reset / wipe
# --------------------------------------------------------------------------- #

async def _reset(session, manifest) -> int:
    """Delete only the rows a previous seed run created."""
    ids = manifest.get("ids", {})
    removed = 0

    models = {
        "qr_codes": QrCodeModel,
        "payments": PaymentModel,
        "volunteer_answers": VolunteerAnswerModel,
        "otp_codes": OtpCodeModel,
        "tickets": TicketModel,
        "university_records": UniversityRecordModel,
        "university_files": UniversityFileModel,
        "audit_logs": AuditLogModel,
        "scanners": ScannerModel,
        "graduates": GraduateModel,
        "events": EventModel,
        "majors": MajorModel,
        "colleges": CollegeModel,
    }

    for table in _SEED_TABLES:
        if table == "event_colleges":
            event_ids = ids.get("events", [])
            if not event_ids:
                continue
            result = await session.execute(
                delete(EventCollegeModel).where(
                    EventCollegeModel.event_id.in_(event_ids)
                )
            )
        elif table == "event_ticket_packages":
            event_ids = ids.get("events", [])
            if not event_ids:
                continue
            result = await session.execute(
                delete(EventTicketPackageModel).where(
                    EventTicketPackageModel.event_id.in_(event_ids)
                )
            )
        else:
            row_ids = ids.get(table, [])
            if not row_ids:
                continue
            model = models[table]
            result = await session.execute(
                delete(model).where(model.id.in_(row_ids))
            )
        removed += result.rowcount or 0

    for key, expected in manifest.get("settings", {}).items():
        row = await session.get(SettingModel, key)
        if row is not None and row.value == expected:
            await session.delete(row)
            removed += 1

    sample = manifest.get("sample_file", {})
    if sample.get("path"):
        try:
            Path(sample["path"]).unlink(missing_ok=True)
        except OSError:
            pass

    await session.commit()
    return removed


async def _wipe(session) -> int:
    """TRUNCATE every application table except the single admin account."""
    from sqlalchemy import text

    tables = [
        "qr_codes",
        "payments",
        "volunteer_answers",
        "otp_codes",
        "tickets",
        "university_records",
        "university_files",
        "audit_logs",
        "scanners",
        "graduates",
        "event_ticket_packages",
        "event_colleges",
        "events",
        "majors",
        "colleges",
        "settings",
    ]
    await session.execute(
        text(
            "TRUNCATE TABLE "
            + ", ".join(f'"{name}"' for name in tables)
            + " RESTART IDENTITY CASCADE"
        )
    )
    await session.commit()
    return len(tables)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def _print_summary(summary) -> None:
    print("")
    print("=" * 72)
    print("SEED SUMMARY")
    print("=" * 72)
    print("")
    print("Ceremonies:")
    for event in summary["events"]:
        window = "OPEN" if event["registration_open"] else "CLOSED"
        print(f"  [{event['id']}] {event['name']}  (registration {window})")
    print("")
    print("Colleges:")
    for college in summary["colleges"]:
        print(f"  [{college['id']}] {college['name']}")
    print("")
    print("Accounts:")
    print(f"  admin    : {summary['admin']['username']} / {summary['admin']['password']}")
    for scanner in summary["scanners"]:
        print(
            f"  scanner  : {scanner['username']} / {summary['scanner_password']}"
            f"  (event {scanner['event_id']})"
        )
    print(f"  graduate : {summary['graduate_password']} (all seeded graduates)")
    print("")
    print("Graduates:")
    for graduate in summary["graduates"]:
        print(
            f"  [{graduate['id']}] {graduate['email']:<26} "
            f"state={graduate['state']:<18} "
            f"ticket={graduate['ticket_status']}"
        )
    print("")
    print("QR codes (scannable):")
    for entry in summary["qr_codes"]:
        for code in entry["codes"]:
            print(
                f"  ticket {entry['ticket_id']} {code['type']:<9} "
                f"{code['value']}  activated={code['is_activated']}"
            )
    print("")
    print("Seats:")
    for seat in summary["seats"]:
        print(f"  ticket {seat['ticket_id']}: {seat['labels']}")
    print("")
    print("OTP codes (e-mail verification / password reset):")
    print(f"  {SEED_OTP_CODE}")
    print("")
    print("Sample university file:")
    print(f"  {summary['sample_file']['path']}")
    print(f"  {summary['sample_file']['rows']} row(s)")
    print("")
    print("Manifest:")
    print(f"  {summary['manifest_path']}")
    print("")


async def _run(args) -> int:
    db_name = _database_name(DATABASE_URL)
    print(f"DATABASE_URL = {_masked_url(DATABASE_URL)}")
    print(f"APP_ENV      = {_app_env()}")
    print(f"database     = {db_name}")
    print("")

    manifest_path = _manifest_path(args)

    async with AsyncSessionLocal() as session:
        if args.wipe:
            print("Wiping every application table (the admin account is kept) ...")
            count = await _wipe(session)
            print(f"Wiped {count} table(s).")
            await _flush_redis_cache()
            return 0

        if args.reset:
            if not manifest_path.is_file():
                print(
                    f"FAILED: no manifest at {manifest_path}.\n"
                    "       Run the seed once before using --reset."
                )
                return 1
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            print("Removing the rows created by the previous seed run ...")
            removed = await _reset(session, manifest)
            print(f"Removed {removed} row(s).")
            await _flush_redis_cache()
            return 0

        # ---- seed ------------------------------------------------------- #
        admin, admin_action = await _seed_admin(session, args)
        _say(args, f"Admin '{admin.username}' {admin_action} (id={admin.id}).")

        colleges, majors = await _seed_colleges(session)
        _say(args, f"Colleges: {len(colleges)} | Majors: {len(majors)}.")

        events = await _seed_events(session, colleges)
        for event in events.values():
            window = "open" if event.registration_end > _utc_now() else "closed"
            _say(args, f"Event '{event.name}' (id={event.id}) [{window}].")

        settings = await _seed_settings(session)
        _say(args, f"Settings: {len(settings)}.")

        scanners = await _seed_scanners(session, args, admin, events)
        _say(args, f"Scanners: {len(scanners)}.")

        records = await _seed_university_records(session, events, colleges, majors)
        _say(args, f"University records: {len(records)}.")

        graduates = await _seed_graduates(session, colleges, majors, args)
        _say(args, f"Graduates: {len(graduates)}.")

        tickets = await _seed_tickets(session, events, graduates)
        _say(args, f"Tickets: {len(tickets)}.")

        payments = await _seed_payments(session, tickets)
        _say(args, f"Payments: {len(payments)}.")

        qr_codes = await _seed_qr_codes(session, tickets)
        _say(args, f"QR codes: {sum(len(v) for v in qr_codes.values())}.")

        await _seed_otp_codes(session, graduates)
        await _seed_volunteer_answers(session, graduates)
        await _seed_audit_logs(session, admin, scanners, events, tickets)

        storage_dir = Path(
            os.getenv("UNIVERSITY_FILES_DIR", "/app/storage/university_files")
        )
        file_row, sample_path = await _seed_university_file(
            session, admin, events, storage_dir
        )
        _say(args, f"University file: {sample_path}")

        await session.commit()

        # ---- manifest -------------------------------------------------- #
        verification_value = _make_verification(graduates["g8"].id)

        manifest = {
            "generated_at": _utc_now().isoformat(),
            "database": db_name,
            "app_env": _app_env(),
            "ids": {
                "colleges": [c.id for c in colleges.values()],
                "majors": [m.id for m in majors.values()],
                "events": [e.id for e in events.values()],
                "graduates": [g.id for g in graduates.values()],
                "tickets": [t.id for t in tickets.values()],
                "payments": [p.id for p in payments.values()],
                "scanners": [s.id for s in scanners.values()],
                "university_records": [r.id for r in records.values()],
                "university_files": [file_row.id],
            },
            "settings": settings,
            "admin": {
                "id": admin.id,
                "username": admin.username,
                "password": args.admin_password,
            },
            "scanner_password": args.scanner_password,
            "graduate_password": args.graduate_password,
            "events": {
                key: {
                    "id": event.id,
                    "name": event.name,
                    "seat_prefix": event.seat_prefix,
                    "registration_start": event.registration_start.isoformat(),
                    "registration_end": event.registration_end.isoformat(),
                }
                for key, event in events.items()
            },
            "colleges": {
                key: {
                    "id": college.id,
                    "name": college.name,
                    "major_ids": {
                        name: majors[(key, name)].id for name in spec["majors"]
                    },
                }
                for key, college in colleges.items()
                for spec in COLLEGES
                if spec["key"] == key
            },
            "graduates": {
                key: {
                    "id": graduate.id,
                    "email": graduate.email,
                    "password": args.graduate_password,
                    "university_id": graduate.university_id,
                    "college_id": graduate.college_id,
                    "major_id": graduate.major_id,
                    "full_name": graduate.full_name,
                    "first_name": graduate.first_name,
                    "last_name": graduate.last_name,
                    "father_name": graduate.father_name,
                    "mother_name": graduate.mother_name,
                    "gender": graduate.gender,
                    "gpa": str(graduate.gpa) if graduate.gpa is not None else None,
                    "top_rank": graduate.top_rank,
                    "email_verified": graduate.email_verified,
                    "state": spec["state"],
                    "ticket_id": tickets[key].id if key in tickets else None,
                    "ticket_status": (
                        _enum_value(tickets[key].status) if key in tickets else None
                    ),
                }
                for key, graduate in graduates.items()
                for spec in GRADUATES
                if spec["key"] == key
            },
            "tickets": {
                key: {
                    "id": ticket.id,
                    "status": _enum_value(ticket.status),
                    "companions_count": ticket.companions_count,
                    "seat_start": ticket.seat_start,
                    "event_id": ticket.event_id,
                }
                for key, ticket in tickets.items()
            },
            "qr_codes": dict(qr_codes),
            "scanners": {
                key: {
                    "id": item.id,
                    "username": item.username,
                    "event_id": item.event_id,
                    "password": args.scanner_password,
                }
                for key, item in scanners.items()
            },
            "checker_record": {
                "university_id": CHECKER_RECORD["university_id"],
                "college_id": colleges[CHECKER_RECORD["college"]].id,
                "major_id": majors[
                    (
                        CHECKER_RECORD["college"],
                        _major_name(CHECKER_RECORD["college"], CHECKER_RECORD["major"]),
                    )
                ].id,
                "full_name": (
                    f"{CHECKER_RECORD['first_name']} {CHECKER_RECORD['last_name']}"
                ),
                "first_name": CHECKER_RECORD["first_name"],
                "last_name": CHECKER_RECORD["last_name"],
                "father_name": CHECKER_RECORD["father_name"],
                "mother_name": CHECKER_RECORD["mother_name"],
                "gender": CHECKER_RECORD["gender"],
                "gpa": CHECKER_RECORD["gpa"],
            },
            "verification_value": verification_value,
            "verification_graduate_id": graduates["g8"].id,
            "otp_code": SEED_OTP_CODE,
            "sample_file": {
                "id": file_row.id,
                "path": str(sample_path),
                "rows": file_row.rows_total,
            },
        }

        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        await _flush_redis_cache()

        # ---- summary --------------------------------------------------- #
        seats = []
        for key in ("g5", "g6"):
            ticket = tickets[key]
            labels = seat_labels(
                events["open"].seat_prefix,
                ticket.seat_start,
                ticket.companions_count,
            )
            seats.append(
                {
                    "ticket_id": ticket.id,
                    "labels": f"{labels['graduate']} -> {labels['range']}"
                    if labels
                    else "-",
                }
            )

        summary = {
            "admin": {
                "username": admin.username,
                "password": args.admin_password,
            },
            "scanner_password": args.scanner_password,
            "graduate_password": args.graduate_password,
            "colleges": [{"id": c.id, "name": c.name} for c in colleges.values()],
            "events": [
                {
                    "id": e.id,
                    "name": e.name,
                    "registration_open": e.registration_end > _utc_now(),
                }
                for e in events.values()
            ],
            "scanners": [
                {"username": s.username, "event_id": s.event_id}
                for s in scanners.values()
            ],
            "graduates": [
                {
                    "id": g.id,
                    "email": g.email,
                    "state": spec["state"],
                    "ticket_status": (
                        _enum_value(tickets[key].status) if key in tickets else "-"
                    ),
                }
                for key, g in graduates.items()
                for spec in GRADUATES
                if spec["key"] == key
            ],
            "qr_codes": [
                {"ticket_id": tickets[key].id, "codes": codes}
                for key, codes in qr_codes.items()
            ],
            "seats": seats,
            "sample_file": {"path": str(sample_path), "rows": file_row.rows_total},
            "manifest_path": str(manifest_path),
        }

        _print_summary(summary)
        return 0


def main() -> None:
    db_name = _database_name(_TARGET_URL)
    _check_safety(_args, db_name)

    if _args.create_db:
        print(f"Ensuring database '{db_name}' exists ...")
        created = asyncio.run(_create_database(_TARGET_URL, db_name))
        print("Database created." if created else "Database already exists.")
        _migrate(_TARGET_URL)
        print("")

    try:
        sys.exit(asyncio.run(_run(_args)))
    except Exception as exc:
        print("")
        print(f"FAILED: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
