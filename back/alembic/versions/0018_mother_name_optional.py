"""the mother's name is optional

The registration no longer asks for the mother's name and the match no longer uses it, so a record
of the university file may come without it and a graduate account may be created without one.
Existing values are kept as they are (nothing is rewritten).

Revision ID: 0018_mother_name_optional
Revises: 0017_scanner_password_copy
Create Date: 2026-11-18 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018_mother_name_optional"
down_revision: Union[str, None] = "0017_scanner_password_copy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("university_records", "mother_name", existing_type=sa.String(255), nullable=True)
    op.alter_column("graduates", "mother_name", existing_type=sa.String(255), nullable=True)


def downgrade() -> None:
    # rows without a value get an empty string so the column can be required again
    op.execute("UPDATE university_records SET mother_name = '' WHERE mother_name IS NULL")
    op.execute("UPDATE graduates SET mother_name = '' WHERE mother_name IS NULL")
    op.alter_column("graduates", "mother_name", existing_type=sa.String(255), nullable=False)
    op.alter_column("university_records", "mother_name", existing_type=sa.String(255), nullable=False)
