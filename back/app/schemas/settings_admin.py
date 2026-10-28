from pydantic import BaseModel, Field, field_validator

from app.core import messages
from app.schemas.graduate import PHONE_REGEX  # D3: same rule as the graduate phone (imported, not copied)

import re

# D1: Latin letters and digits only, no spaces or symbols, 4..100 characters.
_ACCOUNT_REGEX = re.compile(r"^[A-Za-z0-9]{4,100}$")
# D2: Arabic letters, Latin letters, spaces and . - ' ; no digits; 2..200 after trimming.
_RECEIVER_REGEX = re.compile(r"^[\u0600-\u06FFa-zA-Z .\-']{2,200}$")
_PHONE_REGEX = re.compile(PHONE_REGEX)


def _clean_optional(value: str | None) -> str | None:
    """None (absent) passes untouched; blank keeps meaning "clear"; otherwise trim."""
    if value is None:
        return None
    return value.strip()


class AdminSettingsUpdate(BaseModel):
    contact_phone: str | None = Field(default=None, max_length=50)
    shamcash_receiver_name: str | None = Field(default=None, max_length=200)
    shamcash_account_number: str | None = Field(default=None, max_length=100)

    @field_validator("shamcash_account_number", mode="before")
    @classmethod
    def _validate_account_number(cls, value: str | None) -> str | None:
        cleaned = _clean_optional(value)
        if not cleaned:
            # Absent (None) or blank ("clear the setting") — keep service semantics.
            return cleaned
        if not _ACCOUNT_REGEX.fullmatch(cleaned):
            raise ValueError(messages.SETTINGS_ACCOUNT_INVALID)
        return cleaned

    @field_validator("shamcash_receiver_name", mode="before")
    @classmethod
    def _validate_receiver_name(cls, value: str | None) -> str | None:
        cleaned = _clean_optional(value)
        if not cleaned:
            return cleaned
        if not _RECEIVER_REGEX.fullmatch(cleaned):
            raise ValueError(messages.SETTINGS_RECEIVER_INVALID)
        return cleaned

    @field_validator("contact_phone")
    @classmethod
    def _validate_contact_phone(cls, value: str | None) -> str | None:
        cleaned = _clean_optional(value)
        if not cleaned:
            return cleaned
        if not _PHONE_REGEX.fullmatch(cleaned):
            raise ValueError(messages.SETTINGS_PHONE_INVALID)
        return cleaned


class AdminSettingsResponse(BaseModel):
    contact_phone: str | None = None
    shamcash_receiver_name: str | None = None
    shamcash_account_number: str | None = None
    shamcash_qr_image: str | None = None


class PublicShamCashResponse(BaseModel):
    shamcash_qr_image: str | None = None
    shamcash_receiver_name: str | None = None
    shamcash_account_number: str | None = None
