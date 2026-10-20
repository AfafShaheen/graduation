"""college catalog: move event ownership to event_colleges link table

Colleges become a global catalog that several events can reuse (P5.1).
Existing per-event colleges are copied into ``event_colleges`` and then
``colleges.event_id`` is dropped; the name uniqueness becomes global.

Revision ID: 0008_college_catalog
Revises: 0007_names_and_top_rank
Create Date: 2026-10-20 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_college_catalog"
down_revision: Union[str, None] = "0007_names_and_top_rank"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_colleges",
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("college_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["college_id"],
            ["colleges.id"],
            name="fk_event_colleges_college_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name="fk_event_colleges_event_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("event_id", "college_id"),
    )

    op.execute(
        "INSERT INTO event_colleges (event_id, college_id) "
        "SELECT event_id, id FROM colleges WHERE event_id IS NOT NULL"
    )

    # Global uniqueness replaces the per-(name, event) rule.
    op.drop_constraint("unique_college_name_per_event", "colleges", type_="unique")
    op.drop_index("idx_colleges_event_id", table_name="colleges")
    op.drop_constraint("colleges_event_id_fkey", "colleges", type_="foreignkey")
    op.drop_column("colleges", "event_id")
    op.create_unique_constraint("unique_college_name", "colleges", ["name"])


def downgrade() -> None:
    op.drop_constraint("unique_college_name", "colleges", type_="unique")
    op.add_column(
        "colleges",
        sa.Column("event_id", sa.Integer(), nullable=True),
    )
    op.execute(
        "UPDATE colleges SET event_id = "
        "(SELECT ec.event_id FROM event_colleges ec "
        " WHERE ec.college_id = colleges.id ORDER BY ec.event_id LIMIT 1)"
    )
    # The pre-0008 schema cannot represent an unlinked college; drop any.
    op.execute("DELETE FROM colleges WHERE event_id IS NULL")
    op.alter_column("colleges", "event_id", nullable=False)
    op.create_foreign_key(
        "colleges_event_id_fkey",
        "colleges",
        "events",
        ["event_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("idx_colleges_event_id", "colleges", ["event_id"])
    op.create_unique_constraint(
        "unique_college_name_per_event", "colleges", ["name", "event_id"]
    )
    op.drop_table("event_colleges")
