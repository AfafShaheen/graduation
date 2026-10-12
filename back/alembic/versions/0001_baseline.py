"""baseline: state created by migrations/0001_init_schema.sql

This revision is intentionally empty. The initial schema is created by the
``0001_init_schema.sql`` script when the Postgres volume is first initialised
(it is mounted at ``/docker-entrypoint-initdb.d``). Recording this baseline
lets Alembic apply later revisions on fresh databases and lets existing
developer databases be stamped without re-creating anything.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-01-01 00:00:00

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
