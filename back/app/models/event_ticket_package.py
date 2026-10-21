from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class EventTicketPackageModel(Base):
    """A purchasable ticket package for an event.

    Each package defines how many companions a graduate ticket covers
    (``companions_count`` in the range 2..10) and its price. The admin
    defines any number of these packages per event.
    """

    __tablename__ = "event_ticket_packages"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    companions_count = Column(SmallInteger, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("EventModel", back_populates="packages")

    __table_args__ = (
        CheckConstraint(
            "companions_count >= 2 AND companions_count <= 10",
            name="chk_event_ticket_packages_count",
        ),
        CheckConstraint("price >= 0", name="chk_event_ticket_packages_price"),
        UniqueConstraint(
            "event_id",
            "companions_count",
            name="uq_event_ticket_packages_event_count",
        ),
    )
