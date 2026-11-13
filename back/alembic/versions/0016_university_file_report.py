"""what an import did, kept on the file

A file that failed validation used to show only "failed, added 0, skipped 0" in the list, because the
list of errors was sent once in the upload answer and then lost. Now the file keeps its errors
(the first 200) and how many rows were left alone because the graduate had already registered.

Revision ID: 0016_university_file_report
Revises: 0015_audit_actor_graduate
Create Date: 2026-11-13 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_university_file_report"
down_revision: Union[str, None] = "0015_audit_actor_graduate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "university_files",
        sa.Column("rows_skipped_registered", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "university_files",
        sa.Column("error_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("university_files", sa.Column("errors_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("university_files", "errors_json")
    op.drop_column("university_files", "error_count")
    op.drop_column("university_files", "rows_skipped_registered")
