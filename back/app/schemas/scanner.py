"""Pydantic schemas for scanner accounts and the scanner login/scan flow
(SRS FR-20, FR-23, FR-24, FR-25)."""

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.security import validate_password_policy

USERNAME_PATTERN = r"^[A-Za-z0-9_.-]{3,50}$"


class ScannerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=3, max_length=50)
    password: str
    event_id: int = Field(..., gt=0)

    @field_validator("username")
    @classmethod
    def _check_username(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(USERNAME_PATTERN, value):
            raise ValueError("اسم المستخدم غير صالح")
        return value

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_policy(value)


class ScannerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    event_id: int
    created_at: datetime
    # shown to the admin as it is; None for a scanner made before copies were kept (reset it once)
    password: Optional[str] = None


class ScannerPasswordReset(BaseModel):
    """Optional: choose the new password. Left out, one is generated."""

    model_config = ConfigDict(extra="forbid")

    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def _check_password(cls, value):
        return validate_password_policy(value) if value is not None else None
