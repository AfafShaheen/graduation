"""Response models of the admin roster (the full graduates list)."""
from typing import List, Optional

from pydantic import BaseModel


class RosterRegistration(BaseModel):
    """Account state: ``not_registered`` | ``unverified`` | ``verified``."""

    state: str
    graduate_id: Optional[int] = None
    email: Optional[str] = None
    email_verified: Optional[bool] = None


class RosterTicket(BaseModel):
    id: int
    status: str
    companions_count: int
    # ``two`` | ``three`` for the two sold ticket types, otherwise the number.
    type: str
    price: Optional[str] = None
    seat: Optional[str] = None


class RosterPayment(BaseModel):
    """Payment state: ``none`` | ``pending`` | ``confirmed`` | ``rejected``."""

    state: str
    amount: Optional[str] = None
    submitted_at: Optional[str] = None
    # True when the latest payment amount differs from the ticket price.
    mismatch: bool = False


class RosterEntry(BaseModel):
    entered: bool
    at: Optional[str] = None
    # True when an admin registered the entry by hand (no scanner involved).
    manual: bool = False


class RosterActions(BaseModel):
    """Which exceptional actions are allowed right now (rules live in the API)."""

    revert_payment: bool
    manual_entry: bool
    cancel_scan: bool


class RosterItem(BaseModel):
    record_id: int
    event_id: int
    event_name: str
    university_id: str
    full_name: str
    father_name: str
    mother_name: str
    gender: str
    college_id: int
    college_name: str
    major_id: Optional[int] = None
    major_name: Optional[str] = None
    gpa: Optional[str] = None
    # 1, 2 or 3 when the person is one of the top students with a known rank.
    top_rank: Optional[int] = None
    # True for any top student, including the "top student, rank unspecified" case.
    is_top: bool
    file_id: Optional[int] = None
    file_name: Optional[str] = None
    registration: RosterRegistration
    ticket: Optional[RosterTicket] = None
    payment: RosterPayment
    entry: RosterEntry
    actions: RosterActions


class RosterResponse(BaseModel):
    total: int
    items: List[RosterItem]
