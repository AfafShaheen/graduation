"""majors gpa rank

Add ``majors`` table and new columns (`major_id`, `gpa`, `top_rank`) to ``graduates``
and ``university_records`` tables with constraints and ranking indexes.

Revision ID: 0005_majors_gpa_rank
Revises: 0004_volunteer_answers
Create Date: 2026-01-02 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005_majors_gpa_rank"
down_revision: Union[str, None] = "0004_volunteer_answers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create majors table
    op.create_table(
        "majors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("college_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["college_id"],
            ["colleges.id"],
            name="majors_college_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("college_id", "name", name="unique_major_name_per_college"),
    )
    op.create_index(
        "ix_majors_college_id",
        "majors",
        ["college_id"],
        unique=False,
    )

    # 2. Add columns to graduates
    op.add_column("graduates", sa.Column("major_id", sa.Integer(), nullable=True))
    # gpa is nullable for existing rows safely
    op.add_column("graduates", sa.Column("gpa", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("graduates", sa.Column("top_rank", sa.SmallInteger(), nullable=True))

    op.create_foreign_key(
        "graduates_major_id_fkey",
        "graduates",
        "majors",
        ["major_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_graduates_major_id",
        "graduates",
        ["major_id"],
        unique=False,
    )
    op.create_check_constraint(
        "chk_graduate_gpa_range",
        "graduates",
        "gpa IS NULL OR (gpa >= 0 AND gpa <= 100)",
    )
    op.create_check_constraint(
        "chk_graduate_top_rank",
        "graduates",
        "top_rank IS NULL OR top_rank IN (1, 2, 3)",
    )

    # 3. Add columns to university_records
    op.add_column("university_records", sa.Column("major_id", sa.Integer(), nullable=True))
    op.add_column("university_records", sa.Column("gpa", sa.Numeric(precision=5, scale=2), nullable=True))

    op.create_foreign_key(
        "university_records_major_id_fkey",
        "university_records",
        "majors",
        ["major_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_university_records_major_id",
        "university_records",
        ["major_id"],
        unique=False,
    )
    op.create_check_constraint(
        "chk_uni_record_gpa_range",
        "university_records",
        "gpa IS NULL OR (gpa >= 0 AND gpa <= 100)",
    )

    # Composite index to support ranking query per event, college, major, gpa DESC
    op.create_index(
        "idx_uni_records_ranking",
        "university_records",
        ["event_id", "college_id", "major_id", sa.text("gpa DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_uni_records_ranking", table_name="university_records")
    op.drop_constraint("chk_uni_record_gpa_range", "university_records", type_="check")
    op.drop_index("ix_university_records_major_id", table_name="university_records")
    op.drop_constraint("university_records_major_id_fkey", "university_records", type_="foreignkey")
    op.drop_column("university_records", "gpa")
    op.drop_column("university_records", "major_id")

    op.drop_constraint("chk_graduate_top_rank", "graduates", type_="check")
    op.drop_constraint("chk_graduate_gpa_range", "graduates", type_="check")
    op.drop_index("ix_graduates_major_id", table_name="graduates")
    op.drop_constraint("graduates_major_id_fkey", "graduates", type_="foreignkey")
    op.drop_column("graduates", "top_rank")
    op.drop_column("graduates", "gpa")
    op.drop_column("graduates", "major_id")

    op.drop_index("ix_majors_college_id", table_name="majors")
    op.drop_table("majors")
