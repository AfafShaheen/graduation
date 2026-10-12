"""Verify the QR constraint migration (item 2.2) applies and reverts cleanly."""

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
