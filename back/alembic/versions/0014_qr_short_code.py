"""short manual code for every QR code

Every QR code gets a short code (two letters and seven digits, e.g. KM4829173) that a volunteer
can type when the image will not scan. Graduate codes use the letters A-K, companion codes M-Z
(see ``app.core.short_code``). Existing rows are filled here, then the column becomes NOT NULL
and unique.

The downgrade drops the column and its index.

Revision ID: 0014_qr_short_code
Revises: 0013_txn_number_ci_unique
Create Date: 2026-11-05 00:00:00

"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_qr_short_code"
down_revision: Union[str, None] = "0013_txn_number_ci_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# copied from app.core.short_code on purpose: a migration must not change when the app does
_GRADUATE_LETTERS = "ABCDEFGHJK"
_COMPANION_LETTERS = "MNPRSTUVWXYZ"
_INDEX = "uq_qr_codes_short_code"


def _new(is_graduate: bool) -> str:
    letters = _GRADUATE_LETTERS if is_graduate else _COMPANION_LETTERS
    pair = "".join(secrets.choice(letters) for _ in range(2))
    return f"{pair}{secrets.randbelow(10 ** 7):07d}"


def upgrade() -> None:
    op.add_column("qr_codes", sa.Column("short_code", sa.String(length=9), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, code_type::text FROM qr_codes ORDER BY id")).fetchall()
    used: set[str] = set()
    for row_id, code_type in rows:
        code = _new(code_type == "GRADUATE")
        while code in used:
            code = _new(code_type == "GRADUATE")
        used.add(code)
        bind.execute(
            sa.text("UPDATE qr_codes SET short_code = :code WHERE id = :id"),
            {"code": code, "id": row_id},
        )

    op.alter_column("qr_codes", "short_code", nullable=False)
    op.create_index(_INDEX, "qr_codes", ["short_code"], unique=True)


def downgrade() -> None:
    op.drop_index(_INDEX, table_name="qr_codes")
    op.drop_column("qr_codes", "short_code")
