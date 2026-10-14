"""audit log structured references

Add nullable ``event_id`` / ``graduate_id`` / ``ticket_id`` columns to
``audit_logs`` so an audit row can point at the entities it concerns. The
columns are plain integers WITHOUT foreign keys (D21), so the audit trail
survives the deletion of an event, graduate or ticket. Existing rows keep
NULL (no backfill).

Revision ID: 0003_audit_log_refs
Revises: 0002_qr_constraints
Create Date: 2026-01-01 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003_audit_log_refs"
down_revision: Union[str, None] = "0002_qr_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("event_id", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("graduate_id", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("ticket_id", sa.Integer(), nullable=True))
    op.create_index("ix_audit_logs_event_id", "audit_logs", ["event_id"])
    op.create_index("ix_audit_logs_graduate_id", "audit_logs", ["graduate_id"])
    op.create_index("ix_audit_logs_ticket_id", "audit_logs", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_ticket_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_graduate_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_event_id", table_name="audit_logs")
    op.drop_column("audit_logs", "ticket_id")
    op.drop_column("audit_logs", "graduate_id")
    op.drop_column("audit_logs", "event_id")
