"""case-insensitive unique transaction number

D4: the payment ``transaction_number`` is now stored exactly as the graduate
typed it (only surrounding spaces are trimmed, the case is kept). Uniqueness
stays global but becomes case-insensitive, so ``abc-1`` and ``ABC-1`` are the
same number. The plain UNIQUE constraint is replaced by a unique functional
index on ``upper(transaction_number)``; the existing plain index of the column
(``idx_payments_transaction_number``) stays untouched.

Existing rows were all written upper-case by the old validator, so the upgrade
cannot collide. The downgrade restores the old constraint; it is safe because
after this revision no two rows can be equal ignoring case.

Revision ID: 0013_txn_number_ci_unique
Revises: 0012_university_record_file
Create Date: 2026-10-29 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_txn_number_ci_unique"
down_revision: Union[str, None] = "0012_university_record_file"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_CONSTRAINT = "unique_transaction_number"
_CI_INDEX = "uq_payments_transaction_number_ci"


def upgrade() -> None:
    op.drop_constraint(_OLD_CONSTRAINT, "payments", type_="unique")
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {_CI_INDEX} "
        "ON payments (upper(transaction_number))"
    )


def downgrade() -> None:
    duplicates = op.get_bind().execute(
        sa.text(
            "SELECT upper(transaction_number) AS n, COUNT(*) AS occurrences "
            "FROM payments GROUP BY upper(transaction_number) "
            "HAVING COUNT(*) > 1 ORDER BY n"
        )
    ).all()
    if duplicates:
        names = ", ".join(row[0] for row in duplicates)
        raise RuntimeError(
            "Cannot restore the exact-match UNIQUE constraint on "
            "payments.transaction_number: these numbers exist with more than "
            f"one spelling: {names}. Re-normalise the rows first."
        )

    op.execute(f"DROP INDEX IF EXISTS {_CI_INDEX}")
    op.create_unique_constraint(
        _OLD_CONSTRAINT, "payments", ["transaction_number"]
    )
