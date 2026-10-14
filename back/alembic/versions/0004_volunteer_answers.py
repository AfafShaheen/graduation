"""volunteer answers

Add the ``volunteer_answers`` table (SRS extension FR-26): one optional row
per graduate recording whether they want a volunteer responsibility and
whether they have prior experience. ``graduate_id`` is unique and cascades on
delete. No registration-window or ticket dependency.

Revision ID: 0004_volunteer_answers
Revises: 0003_audit_log_refs
Create Date: 2026-01-01 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004_volunteer_answers"
down_revision: Union[str, None] = "0003_audit_log_refs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "volunteer_answers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("graduate_id", sa.Integer(), nullable=False),
        sa.Column("wants_responsibility", sa.Boolean(), nullable=False),
        sa.Column("has_experience", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["graduate_id"],
            ["graduates.id"],
            name="volunteer_answers_graduate_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_volunteer_answers_graduate_id",
        "volunteer_answers",
        ["graduate_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_volunteer_answers_graduate_id", table_name="volunteer_answers"
    )
    op.drop_table("volunteer_answers")
