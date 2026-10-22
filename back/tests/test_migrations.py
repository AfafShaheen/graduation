"""Verify the QR constraint migration (item 2.2), the audit-log reference
migration (item 3.5.1), the volunteer-answers migration (item 3.5.3) and majors/gpa/rank migration (0005) apply
and revert cleanly."""

import os
import subprocess
import sys
from pathlib import Path

import psycopg2
from sqlalchemy.engine import make_url


def _alembic(*args):
    backend = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(backend),
        env=os.environ.copy(),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def _introspect():
    url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")
    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'qr_codes'::regclass"
            )
            constraints = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT indexname FROM pg_indexes WHERE tablename = 'qr_codes'"
            )
            indexes = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()
    return constraints, indexes


def test_qr_migration_applies_expected_schema():
    constraints, indexes = _introspect()

    assert "chk_qr_scanned_at_requires_activation" in constraints
    assert "chk_qr_scanned_by_requires_scanned_at" in constraints
    assert "chk_qr_scanned_fields" not in constraints
    assert "uq_qr_codes_graduate_ticket" in indexes


def test_qr_migration_round_trip():
    _alembic("downgrade", "0001_baseline")
    try:
        constraints, indexes = _introspect()
        assert "chk_qr_scanned_fields" in constraints
        assert "chk_qr_scanned_at_requires_activation" not in constraints
        assert "chk_qr_scanned_by_requires_scanned_at" not in constraints
        assert "uq_qr_codes_graduate_ticket" not in indexes
    finally:
        _alembic("upgrade", "head")

    constraints, indexes = _introspect()
    assert "uq_qr_codes_graduate_ticket" in indexes
    assert "chk_qr_scanned_at_requires_activation" in constraints


def _audit_columns():
    url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")
    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'audit_logs'"
            )
            columns = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT indexname FROM pg_indexes WHERE tablename = 'audit_logs'"
            )
            indexes = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()
    return columns, indexes


def test_audit_refs_migration_applies_expected_schema():
    columns, indexes = _audit_columns()

    assert {"event_id", "graduate_id", "ticket_id"} <= columns
    assert {
        "ix_audit_logs_event_id",
        "ix_audit_logs_graduate_id",
        "ix_audit_logs_ticket_id",
    } <= indexes


def test_audit_refs_migration_round_trip():
    _alembic("downgrade", "0002_qr_constraints")
    try:
        columns, indexes = _audit_columns()
        assert "event_id" not in columns
        assert "graduate_id" not in columns
        assert "ticket_id" not in columns
        assert "ix_audit_logs_event_id" not in indexes
    finally:
        _alembic("upgrade", "head")

    columns, indexes = _audit_columns()
    assert {"event_id", "graduate_id", "ticket_id"} <= columns


def test_audit_rows_survive_refs_migration():
    url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")

    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO audit_logs (actor_type, actor_id, action, target) "
                "VALUES ('ADMIN', 1, 'MIGRATION_MARKER', 'refs') RETURNING id"
            )
            marker_id = cur.fetchone()[0]
        conn.commit()
    finally:
        conn.close()

    _alembic("downgrade", "0002_qr_constraints")
    _alembic("upgrade", "head")

    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT event_id FROM audit_logs WHERE id = %s", (marker_id,)
            )
            row = cur.fetchone()
    finally:
        conn.close()

    assert row is not None
    assert row[0] is None


def _volunteer_schema():
    url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")
    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('volunteer_answers')")
            if cur.fetchone()[0] is None:
                return set(), set(), set()
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'volunteer_answers'"
            )
            columns = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'volunteer_answers'"
            )
            indexes = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT confdeltype FROM pg_constraint "
                "WHERE conrelid = 'volunteer_answers'::regclass "
                "AND contype = 'f'"
            )
            fk_delete = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()
    return columns, indexes, fk_delete


def test_volunteer_migration_applies_expected_schema():
    columns, indexes, fk_delete = _volunteer_schema()

    assert columns == {
        "id",
        "graduate_id",
        "wants_responsibility",
        "has_experience",
        "created_at",
        "updated_at",
    }
    assert "ix_volunteer_answers_graduate_id" in indexes
    # confdeltype 'c' == ON DELETE CASCADE
    assert fk_delete == {"c"}


def test_volunteer_migration_round_trip():
    _alembic("downgrade", "0003_audit_log_refs")
    try:
        columns, indexes, _ = _volunteer_schema()
        assert columns == set()
        assert indexes == set()
    finally:
        _alembic("upgrade", "head")

    columns, _, _ = _volunteer_schema()
    assert "graduate_id" in columns


def test_existing_rows_survive_volunteer_migration():
    url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")

    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO audit_logs (actor_type, actor_id, action, target) "
                "VALUES ('ADMIN', 1, 'VOLUNTEER_MARKER', 'x') RETURNING id"
            )
            marker_id = cur.fetchone()[0]
        conn.commit()
    finally:
        conn.close()

    _alembic("downgrade", "0003_audit_log_refs")
    _alembic("upgrade", "head")

    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT action FROM audit_logs WHERE id = %s", (marker_id,)
            )
            row = cur.fetchone()
    finally:
        conn.close()

    assert row == ("VOLUNTEER_MARKER",)


def _majors_schema():
    url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")
    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('majors')")
            if cur.fetchone()[0] is None:
                return set(), set(), set(), set()
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'majors'"
            )
            majors_cols = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'graduates'"
            )
            grad_cols = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'university_records'"
            )
            uni_cols = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'graduates'::regclass"
            )
            grad_constraints = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()
    return majors_cols, grad_cols, uni_cols, grad_constraints


def test_majors_migration_applies_expected_schema():
    majors_cols, grad_cols, uni_cols, grad_constraints = _majors_schema()
    assert majors_cols == {"id", "name", "college_id"}
    assert {"major_id", "gpa", "top_rank"} <= grad_cols
    assert {"major_id", "gpa"} <= uni_cols
    assert "chk_graduate_gpa_range" in grad_constraints
    assert "chk_graduate_top_rank" in grad_constraints


def test_majors_migration_round_trip():
    _alembic("downgrade", "0004_volunteer_answers")
    try:
        majors_cols, grad_cols, uni_cols, _ = _majors_schema()
        assert majors_cols == set()
        assert "major_id" not in grad_cols
        assert "major_id" not in uni_cols
        assert "gpa" not in uni_cols
    finally:
        _alembic("upgrade", "head")

    majors_cols, grad_cols, uni_cols, grad_constraints = _majors_schema()
    assert "id" in majors_cols
    assert "major_id" in grad_cols
    assert "major_id" in uni_cols
    assert "gpa" in uni_cols
    assert "chk_graduate_gpa_range" in grad_constraints
    assert "chk_graduate_top_rank" in grad_constraints


def _seats_schema():
    url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")
    conn = psycopg2.connect(url.render_as_string(hide_password=False))
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'events'"
            )
            event_cols = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'tickets'"
            )
            ticket_cols = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'tickets'::regclass"
            )
            constraints = {row[0] for row in cur.fetchall()}
            cur.execute(
                "SELECT indexname FROM pg_indexes WHERE tablename = 'tickets'"
            )
            indexes = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()
    return event_cols, ticket_cols, constraints, indexes


def test_seats_migration_applies_expected_schema():
    event_cols, ticket_cols, constraints, indexes = _seats_schema()
    assert {"event_time", "seat_prefix"} <= event_cols
    assert "seat_start" in ticket_cols
    assert "chk_ticket_seat_start_positive" in constraints
    assert "uq_tickets_event_seat_start" in indexes


def test_seats_migration_round_trip():
    _alembic("downgrade", "0005_majors_gpa_rank")
    try:
        event_cols, ticket_cols, constraints, indexes = _seats_schema()
        assert "event_time" not in event_cols
        assert "seat_prefix" not in event_cols
        assert "seat_start" not in ticket_cols
        assert "chk_ticket_seat_start_positive" not in constraints
        assert "uq_tickets_event_seat_start" not in indexes
    finally:
        _alembic("upgrade", "head")

    event_cols, ticket_cols, constraints, indexes = _seats_schema()
    assert {"event_time", "seat_prefix"} <= event_cols
    assert "seat_start" in ticket_cols


async def _seat_rows():
    from sqlalchemy import text

    from app.core.database import engine

    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT id, seat_start FROM tickets ORDER BY id")
        )
        return [(row[0], row[1]) for row in result.all()]


async def test_seat_backfill_assigns_consecutive_blocks(
    db, make_event, make_college, make_graduate, make_ticket
):
    pass
    event = await make_event()
    college = await make_college(event.id)
    first = await make_graduate(college.id, university_id="920001")
    second = await make_graduate(college.id, university_id="920002")
    third = await make_graduate(college.id, university_id="920003")

    await make_ticket(first.id, event.id2)
    await make_ticket(second.id, event.id3)
    await make_ticket(third.id, event.id2)
    # Release the transaction so the schema DDL below is not blocked by locks.
    await db.commit()

    # Downgrading drops the column (and its values); upgrading re-adds it and
    # re-runs the backfill over the surviving confirmed rows.
    _alembic("downgrade", "0005_majors_gpa_rank")
    try:
        _, ticket_cols, _, _ = _seats_schema()
        assert "seat_start" not in ticket_cols
    finally:
        _alembic("upgrade", "head")

    rows = await _seat_rows()
    # Block sizes are 1+companions: 3, 4, 3 -> starts 1, 4, 8.
    assert [seat for _, seat in rows] == [1, 4, 8]


async def test_seat_partial_unique_index_enforced(
    make_event, make_college, make_graduate, make_ticket, db
):
    import pytest
    from sqlalchemy import update
    from sqlalchemy.exc import IntegrityError

    from app.models.ticket import TicketModel

    event = await make_event()
    college = await make_college(event.id)
    first = await make_graduate(college.id, university_id="920011")
    second = await make_graduate(college.id, university_id="920012")
    first_ticket = await make_ticket(first.id, event.id)
    second_ticket = await make_ticket(second.id, event.id)

    with pytest.raises(IntegrityError):
        await db.execute(
            update(TicketModel)
            .where(TicketModel.id == first_ticket.id)
            .values(seat_start=1)
        )
        await db.execute(
            update(TicketModel).where(TicketModel.id == second_ticket.id).values(seat_start=1)
        )
        await db.commit()
    await db.rollback()


async def test_seat_positive_check_enforced(
    make_event, make_college, make_graduate, make_ticket, db
):
    import pytest
    from sqlalchemy import update
    from sqlalchemy.exc import IntegrityError

    from app.models.ticket import TicketModel

    event = await make_event()
    college = await make_college(event.id)
    graduate = await make_graduate(college.id, university_id="920021")
    ticket = await make_ticket(graduate.id, event.id)

    with pytest.raises(IntegrityError):
        await db.execute(
            update(TicketModel).where(TicketModel.id == ticket.id).values(seat_start=0)
        )
        await db.commit()
    await db.rollback()
