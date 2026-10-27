"""names, top rank from file and phone on records

Add ``first_name``/``last_name`` split name columns to ``university_records``
and ``graduates`` and ``top_rank_from_file``/``phone`` to
``university_records`` to support the fixed Affairs office file format.

Revision ID: 0007_names_and_top_rank
Revises: 0006_event_time_and_seats
Create Date: 2026-10-17 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0007_names_and_top_rank"
down_revision: Union[str, None] = "0006_event_time_and_seats"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "university_records",
        sa.Column("first_name", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "university_records",
        sa.Column("last_name", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "university_records",
        sa.Column("top_rank_from_file", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "university_records",
        sa.Column("phone", sa.String(length=50), nullable=True),
    )
    op.create_check_constraint(
        "chk_uni_records_top_from_file",
        "university_records",
        "top_rank_from_file IS NULL OR top_rank_from_file IN (-1, 0, 1, 2, 3)",
    )

    op.add_column(
        "graduates",
        sa.Column("first_name", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "graduates",
        sa.Column("last_name", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("graduates", "last_name")
    op.drop_column("graduates", "first_name")
    op.drop_constraint(
        "chk_uni_records_top_from_file", "university_records", type_="check"
    )
    op.drop_column("university_records", "phone")
    op.drop_column("university_records", "top_rank_from_file")
    op.drop_column("university_records", "last_name")
    op.drop_column("university_records", "first_name")
