"""event ticket packages

Revision ID: 0010_event_ticket_packages
Revises: 0009_university_files
Create Date: 2026-10-20

Replaces the fixed 2/3-companion model with per-event dynamic packages.

- New table ``event_ticket_packages`` (companions_count 2..10, own price).
- Backfills every existing event with a (2, price_2_companions) package and,
  when ``is_3companions_enabled`` was true, a (3, price_3_companions) package.
- Drops ``chk_ticket_companions_count`` and the ``ticket_type`` column + enum
  (``companions_count`` now carries all the information).
- Drops the three legacy ``events`` pricing columns and ``chk_event_prices_positive``.
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_event_ticket_packages"
down_revision = "0009_university_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_ticket_packages",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "event_id",
            sa.Integer(),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("companions_count", sa.SmallInteger(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "companions_count >= 2 AND companions_count <= 10",
            name="chk_event_ticket_packages_count",
        ),
        sa.CheckConstraint("price >= 0", name="chk_event_ticket_packages_price"),
        sa.UniqueConstraint(
            "event_id", "companions_count", name="uq_event_ticket_packages_event_count"
        ),
    )
    op.create_index(
        "ix_event_ticket_packages_event_id",
        "event_ticket_packages",
        ["event_id"],
    )

    # Backfill packages from the legacy event columns.
    op.execute(
        """
        INSERT INTO event_ticket_packages (event_id, companions_count, price)
        SELECT id, 2, price_2_companions FROM events
        """
    )
    op.execute(
        """
        INSERT INTO event_ticket_packages (event_id, companions_count, price)
        SELECT id, 3, price_3_companions FROM events
        WHERE is_3companions_enabled = true
        """
    )

    # Tickets no longer need ticket_type or the 2/3 check constraint.
    op.drop_constraint("chk_ticket_companions_count", "tickets", type_="check")
    op.drop_column("tickets", "ticket_type")
    op.execute("DROP TYPE IF EXISTS ticket_type")

    # Drop the legacy per-event pricing columns.
    op.drop_constraint("chk_event_prices_positive", "events", type_="check")
    op.drop_column("events", "price_2_companions")
    op.drop_column("events", "price_3_companions")
    op.drop_column("events", "is_3companions_enabled")


def downgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "is_3companions_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "events",
        sa.Column("price_2_companions", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("price_3_companions", sa.Numeric(10, 2), nullable=True),
    )
    op.execute(
        """
        UPDATE events e
        SET price_2_companions = p.price
        FROM event_ticket_packages p
        WHERE p.event_id = e.id AND p.companions_count = 2
        """
    )
    op.execute(
        """
        UPDATE events e
        SET price_3_companions = p.price
        FROM event_ticket_packages p
        WHERE p.event_id = e.id AND p.companions_count = 3
        """
    )
    op.execute("UPDATE events SET price_2_companions = 0 WHERE price_2_companions IS NULL")
    op.execute("UPDATE events SET price_3_companions = 0 WHERE price_3_companions IS NULL")
    op.alter_column("events", "price_2_companions", nullable=False)
    op.alter_column("events", "price_3_companions", nullable=False)
    op.create_check_constraint(
        "chk_event_prices_positive",
        "events",
        "price_2_companions >= 0 AND price_3_companions >= 0",
    )

    ticket_type = sa.Enum(
        "TWO_COMPANIONS", "THREE_COMPANIONS", name="ticket_type"
    )
    ticket_type.create(op.get_bind(), checkfirst=True)
    op.add_column("tickets", sa.Column("ticket_type", ticket_type, nullable=True))
    op.execute(
        """
        UPDATE tickets SET ticket_type = (CASE
            WHEN companions_count <= 2 THEN 'TWO_COMPANIONS'
            ELSE 'THREE_COMPANIONS'
        END)::ticket_type
        """
    )
    op.alter_column("tickets", "ticket_type", nullable=False)
    op.create_check_constraint(
        "chk_ticket_companions_count",
        "tickets",
        "(ticket_type = 'TWO_COMPANIONS' AND companions_count = 2) OR (ticket_type = 'THREE_COMPANIONS' AND companions_count = 3)",
    )

    op.drop_index("ix_event_ticket_packages_event_id", "event_ticket_packages")
    op.drop_table("event_ticket_packages")
