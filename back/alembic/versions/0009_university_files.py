"""university files center: store uploaded data files (P6.1)

Adds ``university_files`` so an uploaded data file is persisted (path +
metadata) and linked to a single event from the central «ملفات البيانات»
page, instead of being parsed and discarded.

Revision ID: 0009_university_files
Revises: 0008_college_catalog
Create Date: 2026-10-20 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_university_files"
down_revision: Union[str, None] = "0008_college_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "university_files",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=True),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("stored_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("rows_total", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("rows_imported", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("rows_updated", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("rows_skipped", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'uploaded'")),
        sa.Column("uploaded_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name="fk_university_files_event_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"],
            ["admins.id"],
            name="fk_university_files_uploaded_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_university_files_id", "university_files", ["id"], unique=False
    )
    op.create_index(
        "ix_university_files_event_id", "university_files", ["event_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_university_files_event_id", table_name="university_files")
    op.drop_index("ix_university_files_id", table_name="university_files")
    op.drop_table("university_files")
