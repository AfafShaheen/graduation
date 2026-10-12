"""qr code integrity constraints

Restructures qr_codes constraints so the lifecycle is explicit:

* checked-in graduates have is_activated = true and a scanned_at time;
* a scanned_at or scanned_by_scanner_id may only be set once activated;
* a ticket owns at most one graduate QR code.

Revision ID: 0002_qr_constraints
Revises: 0001_baseline
Create Date: 2026-01-01 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_qr_constraints"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Graduate QR codes are activated at creation time going forward; mark
    # any rows produced before this migration (none in practice) as activated.
    op.execute(
        "UPDATE qr_codes SET is_activated = true "
        "WHERE code_type = 'GRADUATE'"
    )

    # 2. The old single constraint mixed activation with scanning. Replace it
    # with two independent, clearer checks.
    op.drop_constraint("chk_qr_scanned_fields", "qr_codes", type_="check")
    op.create_check_constraint(
        "chk_qr_scanned_at_requires_activation",
        "qr_codes",
        "scanned_at IS NULL OR is_activated",
    )
    op.create_check_constraint(
        "chk_qr_scanned_by_requires_scanned_at",
        "qr_codes",
        "scanned_by_scanner_id IS NULL OR scanned_at IS NOT NULL",
    )

    # 3. A ticket owns at most one graduate QR code.
    op.create_index(
        "uq_qr_codes_graduate_ticket",
        "qr_codes",
        ["ticket_id"],
        unique=True,
        postgresql_where=sa.text("code_type = 'GRADUATE'"),
    )


def downgrade() -> None:
    # NOTE: rows that were activated but never scanned cannot be represented
    # by the old constraint; they are reset to "not activated".
    op.drop_index("uq_qr_codes_graduate_ticket", table_name="qr_codes")
    op.drop_constraint(
        "chk_qr_scanned_by_requires_scanned_at", "qr_codes", type_="check"
    )
    op.drop_constraint(
        "chk_qr_scanned_at_requires_activation", "qr_codes", type_="check"
    )
    op.execute(
        "UPDATE qr_codes SET is_activated = "
        "(scanned_at IS NOT NULL AND scanned_by_scanner_id IS NOT NULL)"
    )
    op.create_check_constraint(
        "chk_qr_scanned_fields",
        "qr_codes",
        "(is_activated IS TRUE AND scanned_at IS NOT NULL "
        "AND scanned_by_scanner_id IS NOT NULL) OR "
        "(is_activated IS FALSE AND scanned_at IS NULL "
        "AND scanned_by_scanner_id IS NULL)",
    )