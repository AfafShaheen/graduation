"""event time and seats

Add an optional ceremony time and an optional seat prefix to ``events`` and a
``seat_start`` column to ``tickets`` with a positivity check and a partial
unique index per event. Existing confirmed tickets are backfilled with
consecutive seat blocks in confirmation order.

Revision ID: 0006_event_time_and_seats
Revises: 0005_majors_gpa_rank
Create Date: 2026-01-03 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006_event_time_and_seats"
down_revision: Union[str, None] = "0005_majors_gpa_rank"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Event: optional ceremony time and seat prefix (1-3 letters).
    op.add_column("events", sa.Column("event_time", sa.Time(), nullable=True))
    op.add_column("events", sa.Column("seat_prefix", sa.String(length=3), nullable=True))

    # 2. Ticket: sequential seat start assigned at payment confirmation.
    op.add_column("tickets", sa.Column("seat_start", sa.Integer(), nullable=True))

    # 3. Backfill existing confirmed tickets with consecutive blocks per event.
    #    Each block reserves ``1 + companions_count`` numbers; the graduate takes
    #    the first number, companions follow. Order is (confirmed_at, id).
    op.execute(
        """
        UPDATE tickets AS t
        SET seat_start = ranked.block_start
        FROM (
            SELECT id,
                   COALESCE(
                       SUM(1 + companions_count) OVER (
                           PARTITION BY event_id
                           ORDER BY confirmed_at, id
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                       ),
                       0
                   ) + 1 AS block_start
            FROM tickets
            WHERE status = 'CONFIRMED'
        ) AS ranked
        WHERE t.id = ranked.id
        """
    )

    # 4. Constraints and the partial unique index that prevents overlaps.
    op.create_check_constraint(
        "chk_ticket_seat_start_positive",
        "tickets",
        "seat_start IS NULL OR seat_start >= 1",
    )
    op.create_index(
        "uq_tickets_event_seat_start",
        "tickets",
        ["event_id", "seat_start"],
        unique=True,
        postgresql_where=sa.text("seat_start IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_tickets_event_seat_start", table_name="tickets")
    op.drop_constraint("chk_ticket_seat_start_positive", "tickets", type_="check")
    op.drop_column("tickets", "seat_start")
    op.drop_column("events", "seat_prefix")
    op.drop_column("events", "event_time")
