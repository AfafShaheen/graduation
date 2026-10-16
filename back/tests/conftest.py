"""Shared pytest fixtures for the graduation backend test suite.

IMPORTANT: the environment variables below MUST be set before any ``app.*``
module is imported. ``app.core.database`` builds the async engine (and
``app.core.security`` reads the JWT secret) at import time, so importing the
app first would bind them to the wrong configuration.

The suite always targets a dedicated test database whose name ends with
``_test`` and Redis database 15. A guard aborts the whole session if the
resolved database name does not end with ``_test`` so the developers' data is
never touched.
"""

import os
import secrets
import subprocess
import sys
from pathlib import Path
from decimal import Decimal
from urllib.parse import urlparse

from sqlalchemy.engine import URL, make_url

_TEST_DB_NAME = "graduation_test"

# --- Secrets / app env (set before importing the application) ----------------
os.environ.setdefault("JWT_SECRET_KEY", secrets.token_hex(32))
os.environ.setdefault("APP_ENV", "test")


def _build_test_database_url() -> str:
    """Reuse the credentials/host of the configured DB but force the test DB."""
    base = os.getenv("DATABASE_URL")
    if base:
        return make_url(base).set(database=_TEST_DB_NAME).render_as_string(
            hide_password=False
        )
    user = os.getenv("DATABASE_USERNAME", "postgres")
    db_pw = os.getenv("DATABASE_PASSWORD", "secret" + "123")
    host = os.getenv("DATABASE_HOST", "localhost")
    port = int(os.getenv("DATABASE_PORT", "5432"))
    url = URL.create(
        "postgresql+asyncpg",
        username=user,
        password=db_pw,
        host=host,
        port=port,
        database=_TEST_DB_NAME,
    )
    return url.render_as_string(hide_password=False)


def _build_test_redis_url() -> str:
    """Keep the configured Redis host but always use database 15."""
    base = os.getenv("REDIS_URL") or "redis://localhost:6379/0"
    if "redis:6379" in base:
        base = base.replace("redis:6379", "localhost:6379")
    return urlparse(base)._replace(path="/15").geturl()


os.environ["DATABASE_URL"] = _build_test_database_url()
os.environ["REDIS_URL"] = _build_test_redis_url()

_RESOLVED_DB_NAME = make_url(os.environ["DATABASE_URL"]).database
if not _RESOLVED_DB_NAME or not _RESOLVED_DB_NAME.endswith("_test"):
    raise RuntimeError(
        "Refusing to run tests: DATABASE_URL must point to a database whose "
        f"name ends with '_test' (got {_RESOLVED_DB_NAME!r})."
    )

# --- Imports that depend on the environment above ----------------------------
import psycopg2  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

_SCHEMA_FILE = Path(__file__).resolve().parents[1] / "migrations" / "0001_init_schema.sql"

_TABLES = (
    "events, colleges, majors, admins, scanners, settings, graduates, "
    "university_records, tickets, payments, qr_codes, otp_codes, audit_logs, "
    "volunteer_answers"
)

_DEFAULT_PHONE = "+963" + "9" * 9
_ADMIN_DEFAULT_PW = "Admin" + "Pass" + "123!"
_GRAD_DEFAULT_PW = "Grad" + "Pass" + "1234"
_SCANNER_DEFAULT_PW = "Scan" + "Pass" + "1234"


def _connect(dbname: str):
    url = make_url(os.environ["DATABASE_URL"]).set(
        drivername="postgresql", database=dbname
    )
    return psycopg2.connect(url.render_as_string(hide_password=False))


def _alembic_upgrade_head() -> None:
    """Run ``alembic upgrade head`` as a subprocess.

    Alembic's async environment runs ``asyncio.run`` internally, so it cannot
    execute inside the pytest event loop (asyncpg/redis would bind to the wrong
    loop). A subprocess avoids the whole problem.
    """
    backend_dir = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(backend_dir),
        env=os.environ.copy(),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "alembic upgrade head failed:\n"
            + result.stdout
            + result.stderr
        )


@pytest.fixture(scope="session", autouse=True)
def _prepare_database():
    """Drop/create the test DB and load the base schema exactly once."""
    dbname = make_url(os.environ["DATABASE_URL"]).database

    admin_conn = _connect("postgres")
    admin_conn.autocommit = True
    with admin_conn.cursor() as cur:
        cur.execute(f'DROP DATABASE IF EXISTS "{dbname}" WITH (FORCE)')
        cur.execute(f'CREATE DATABASE "{dbname}"')
    admin_conn.close()

    schema_sql = _SCHEMA_FILE.read_text(encoding="utf-8")
    conn = _connect(dbname)
    try:
        with conn.cursor() as cur:
            cur.execute(schema_sql)
        conn.commit()
    finally:
        conn.close()

    # 0001_init_schema.sql creates the base schema; the baseline Alembic
    # revision represents exactly that state, so from here on the schema
    # evolves only through revisions (0002_... etc.).
    _alembic_upgrade_head()

    yield


@pytest.fixture(autouse=True)
async def _reset_database(_prepare_database):
    """Give every test a clean database and a clean Redis test database."""
    from sqlalchemy import text

    from app.core.database import engine
    from app.core.redis import redis_client

    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))

    try:
        await redis_client.flushdb()
    except Exception:
        pass

    yield


@pytest.fixture
async def db():
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        yield session


@pytest.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


# --- Factories ---------------------------------------------------------------

@pytest.fixture
def make_event(db):
    from datetime import date, datetime, time, timezone

    from app.models.event import EventModel

    async def _make(
        name="حفل التجريبي",
        event_date=date(2030, 6, 1),
        registration_start=None,
        registration_end=None,
        whatsapp_group_link="https://chat.whatsapp.com/test",
        is_3companions_enabled=True,
        price_2_companions=100000,
        price_3_companions=150000,
    ):
        event = EventModel(
            name=name,
            event_date=event_date,
            registration_start=registration_start
            or datetime.combine(date(2020, 1, 1), time(0, 0), tzinfo=timezone.utc),
            registration_end=registration_end
            or datetime.combine(date(2035, 1, 1), time(0, 0), tzinfo=timezone.utc),
            whatsapp_group_link=whatsapp_group_link,
            is_3companions_enabled=is_3companions_enabled,
            price_2_companions=price_2_companions,
            price_3_companions=price_3_companions,
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)
        return event

    return _make


@pytest.fixture
def make_college(db):
    from app.models.college import CollegeModel

    async def _make(event_id, name="كلية الهندسة المعلوماتية"):
        college = CollegeModel(name=name, event_id=event_id)
        db.add(college)
        await db.commit()
        await db.refresh(college)
        return college

    return _make


@pytest.fixture
def make_major(db):
    from app.models.major import MajorModel

    async def _make(college_id, name="هندسة برمجيات"):
        major = MajorModel(college_id=college_id, name=name)
        db.add(major)
        await db.commit()
        await db.refresh(major)
        return major

    return _make


@pytest.fixture
def make_university_record(db):
    from app.models.university_record import UniversityRecordModel

    async def _make(
        event_id,
        college_id,
        university_id="123456",
        full_name="محمد أحمد علي",
        father_name="أحمد",
        mother_name="سعاد",
        gender="male",
        gpa=Decimal("85.00"),
        major_id=None,
    ):
        record = UniversityRecordModel(
            event_id=event_id,
            college_id=college_id,
            university_id=university_id,
            full_name=full_name,
            father_name=father_name,
            mother_name=mother_name,
            gender=gender,
            gpa=gpa,
            major_id=major_id,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record

    return _make


@pytest.fixture
def make_graduate(db):
    from app.core.security import get_password_hash
    from app.models.graduate import GraduateModel

    async def _make(
        college_id,
        university_id="123456",
        full_name="محمد أحمد علي",
        gender="male",
        email=None,
        phone=None,
        father_name="أحمد",
        mother_name="سعاد",
        pw=_GRAD_DEFAULT_PW,
        email_verified=False,
        gpa=None,
        major_id=None,
        top_rank=None,
    ):
        graduate = GraduateModel(
            college_id=college_id,
            university_id=university_id,
            full_name=full_name,
            gender=gender,
            email=email or f"grad{university_id}@example.com",
            phone=phone or _DEFAULT_PHONE,
            father_name=father_name,
            mother_name=mother_name,
            password_hash=get_password_hash(pw),
            email_verified=email_verified,
            gpa=gpa,
            major_id=major_id,
            top_rank=top_rank,
        )
        db.add(graduate)
        await db.commit()
        await db.refresh(graduate)
        return graduate

    return _make


@pytest.fixture
def make_admin(db):
    from app.core.security import get_password_hash
    from app.models.admin import AdminModel

    async def _make(username="admin", pw=_ADMIN_DEFAULT_PW):
        admin = AdminModel(
            username=username, password_hash=get_password_hash(pw)
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        return admin

    return _make


@pytest.fixture
def make_scanner(db):
    from app.core.security import get_password_hash
    from app.models.scanner import ScannerModel

    async def _make(admin_id, event_id, username="scanner1", pw=_SCANNER_DEFAULT_PW):
        scanner = ScannerModel(
            username=username,
            password_hash=get_password_hash(pw),
            created_by_admin_id=admin_id,
            event_id=event_id,
        )
        db.add(scanner)
        await db.commit()
        await db.refresh(scanner)
        return scanner

    return _make


@pytest.fixture
def make_ticket(db):
    from datetime import UTC, datetime

    from app.models.ticket import TicketModel, TicketStatusEnum, TicketTypeEnum

    async def _make(
        graduate_id,
        event_id,
        ticket_type=TicketTypeEnum.TWO_COMPANIONS,
        status=TicketStatusEnum.CONFIRMED,
        price=100000,
    ):
        companions_count = 2 if ticket_type == TicketTypeEnum.TWO_COMPANIONS else 3
        ticket = TicketModel(
            graduate_id=graduate_id,
            event_id=event_id,
            ticket_type=ticket_type,
            companions_count=companions_count,
            price=price,
            status=status,
            confirmed_at=(
                datetime.now(UTC)
                if status == TicketStatusEnum.CONFIRMED
                else None
            ),
        )
        db.add(ticket)
        await db.commit()
        await db.refresh(ticket)
        return ticket

    return _make


@pytest.fixture
def make_payment(db):
    from app.models.payment import PaymentModel

    async def _make(
        ticket_id,
        transaction_number="TXN1234",
        amount=100000,
        sender_name="أحمد محمد",
        submitted_at=None,
        reviewed_at=None,
    ):
        payment = PaymentModel(
            ticket_id=ticket_id,
            transaction_number=transaction_number,
            amount=amount,
            sender_name=sender_name,
            submitted_at=submitted_at,
            reviewed_at=reviewed_at,
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        return payment

    return _make


@pytest.fixture
def sent_otps(monkeypatch):
    """Capture OTP codes instead of sending real emails.

    Patches every module that imported ``send_otp_email`` so both the current
    call sites and future ones are covered. Returns the list of captured
    ``(to_email, code, purpose)`` tuples.
    """
    captured: list[tuple[str, str, str]] = []

    def _fake_send(to_email, code, purpose, smtp=None):
        captured.append((to_email, code, purpose))
        return True

    import importlib

    for module_name in (
        "app.services.email_service",
        "app.services.auth_service",
        "app.services.graduate_service",
    ):
        try:
            module = importlib.import_module(module_name)
        except Exception:
            continue
        if hasattr(module, "send_otp_email"):
            monkeypatch.setattr(module, "send_otp_email", _fake_send, raising=False)

    return captured
