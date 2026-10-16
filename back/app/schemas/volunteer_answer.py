"""Schemas for the volunteer-answers feature (SRS extension FR-26)."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

YesNo = Literal["yes", "no"]


class VolunteerAnswerUpsert(BaseModel):
    """PUT body: exactly the two yes/no answers, nothing else."""

    model_config = ConfigDict(extra="forbid")

    wants_responsibility: YesNo
    has_experience: YesNo


class VolunteerAnswerResponse(BaseModel):
    answered: bool
    wants_responsibility: Optional[YesNo] = None
    has_experience: Optional[YesNo] = None


class VolunteerStats(BaseModel):
    all: int
    wants: int
    experienced: int
    both: int


class VolunteerListItem(BaseModel):
    id: int
    graduate_id: int
    full_name: str
    university_id: str
    college_id: int
    college_name: str
    phone: str
    wants_responsibility: YesNo
    has_experience: YesNo
    registered_at: datetime
    top_rank: Optional[int] = None
    gpa: Optional[str] = None
    major_id: Optional[int] = None
    major_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class VolunteerListResponse(BaseModel):
    stats: VolunteerStats
    total: int
    items: list[VolunteerListItem]
