"""remember which uploaded file each university record came from

Adds ``university_records.file_id`` (nullable, ``ON DELETE SET NULL``) so the
admin roster can filter by uploaded file and show where a person came from.
Existing rows keep ``file_id = NULL`` (their source file is unknown).

Revision ID: 0012_university_record_file
Revises: 0011_scanner_username_per_event
Create Date: 2026-10-26 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_university_record_file"
down_revision: Union[str, None] = "0011_scanner_username_per_event"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FK = "fk_university_records_file_id"
_IX = "ix_university_records_file_id"


def upgrade() -> None:
    op.add_column(
        "university_records", sa.Column("file_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        _FK,
        "university_records",
        "university_files",
        ["file_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(_IX, "university_records", ["file_id"])


def downgrade() -> None:
    op.drop_index(_IX, table_name="university_records")
    op.drop_constraint(_FK, "university_records", type_="foreignkey")
    op.drop_column("university_records", "file_id")
