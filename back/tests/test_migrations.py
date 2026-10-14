"""Verify the QR constraint migration (item 2.2) and the audit-log reference
migration (item 3.5.1) apply and revert cleanly."""

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
