"""an encrypted copy of a scanner's password, so the admin can show it

Scanner passwords were only stored as a bcrypt hash, which cannot be read back. The admin needs to
see them (a volunteer forgets his password at the gate), so an encrypted copy is kept next to the
hash (see app/core/secret_box.py). Login still uses the hash only. Existing scanners have no copy
until their password is reset once.

Revision ID: 0017_scanner_password_copy
Revises: 0016_university_file_report
Create Date: 2026-11-13 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017_scanner_password_copy"
down_revision: Union[str, None] = "0016_university_file_report"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scanners", sa.Column("password_enc", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("scanners", "password_enc")
