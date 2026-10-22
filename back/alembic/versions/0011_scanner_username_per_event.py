"""scanner usernames are unique per event, not globally

Scanner accounts belong to a ceremony, so the same username may be reused in
different ceremonies while staying unique inside one ceremony.

- Drops the global UNIQUE constraint on ``scanners.username`` (the constraint
  and its unique index are named ``scanners_username_key`` in the schema
  created by ``migrations/0001_init_schema.sql``).
- Keeps a plain index on ``username`` for login lookups.
- Adds UNIQUE (username, event_id) as ``uq_scanners_username_event``.

Revision ID: 0011_scanner_username_per_event
Revises: 0010_event_ticket_packages
Create Date: 2026-10-22 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_scanner_username_per_event"
down_revision: Union[str, None] = "0010_event_ticket_packages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_UNIQUE = "scanners_username_key"
_NEW_UNIQUE = "uq_scanners_username_event"
_USERNAME_INDEX = "ix_scanners_username"


def upgrade() -> None:
    op.drop_constraint(_OLD_UNIQUE, "scanners", type_="unique")
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_USERNAME_INDEX} ON scanners (username)"
    )
    op.create_unique_constraint(
        _NEW_UNIQUE, "scanners", ["username", "event_id"]
    )


def downgrade() -> None:
    duplicates = op.get_bind().execute(
        sa.text(
            "SELECT username, COUNT(*) AS occurrences "
            "FROM scanners GROUP BY username HAVING COUNT(*) > 1 "
            "ORDER BY username"
        )
    ).all()
    if duplicates:
        names = ", ".join(row[0] for row in duplicates)
        raise RuntimeError(
            "Cannot restore the global UNIQUE(username) constraint on scanners: "
            "these usernames exist in more than one event: "
            f"{names}. Delete or rename the duplicate scanner accounts first."
        )

    op.drop_constraint(_NEW_UNIQUE, "scanners", type_="unique")
    op.execute(f"DROP INDEX IF EXISTS {_USERNAME_INDEX}")
    op.create_unique_constraint(_OLD_UNIQUE, "scanners", ["username"])
