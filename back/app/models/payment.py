from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, UniqueConstraint
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
        UniqueConstraint("transaction_number", name="unique_transaction_number"),
    )
