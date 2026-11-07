"""the audit log can record what a graduate did

A graduate's own important actions (account created, e-mail confirmed, package chosen or changed,
payment submitted, password reset) are written to the audit log with the graduate as the actor.
That needs one more value in the PostgreSQL enum ``actor_type``.

The downgrade leaves the value in place: PostgreSQL cannot drop a value from an enum, and an
unused value does no harm.

Revision ID: 0015_audit_actor_graduate
Revises: 0014_qr_short_code
Create Date: 2026-11-07 00:00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = "0015_audit_actor_graduate"
down_revision: Union[str, None] = "0014_qr_short_code"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block on older PostgreSQL versions
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE actor_type ADD VALUE IF NOT EXISTS 'GRADUATE'")


def downgrade() -> None:
    pass
