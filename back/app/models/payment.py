from sqlalchemy import Column, Index, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base

class PaymentModel(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_number = Column(String(100), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    sender_name = Column(String(255), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True))

    ticket = relationship("TicketModel", backref="payments")

    __table_args__ = (
        # D4: uniqueness stays global but case-insensitive; the stored text
        # keeps the case the graduate typed. Migration 0013 creates this index.
        Index(
            "uq_payments_transaction_number_ci",
            func.upper(transaction_number),
            unique=True,
        ),
    )
