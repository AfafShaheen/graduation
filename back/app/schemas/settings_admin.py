import re

from pydantic import BaseModel, Field, field_validator


class AdminSettingsUpdate(BaseModel):
    contact_phone: str | None = Field(default=None, max_length=50)
    shamcash_receiver_name: str | None = Field(default=None, max_length=200)
    shamcash_account_number: str | None = Field(default=None, max_length=100)

    @field_validator("shamcash_account_number")
    @classmethod
    def _validate_shamcash_account(cls, value):
        if value is None:
            return None
        v = value.strip()
        if v == "":
            return None
        # letters (Latin), digits, dash; no spaces, no '+' (it is NOT a phone number)
        if not re.fullmatch(r"[A-Za-z0-9-]{4,100}", v):
            raise ValueError("رقم حساب شام كاش يجب أن يتكون من أحرف إنجليزية وأرقام (4 خانات على الأقل) بدون مسافات")
        return v


class AdminSettingsResponse(BaseModel):
    contact_phone: str | None = None
    shamcash_receiver_name: str | None = None
    shamcash_account_number: str | None = None
    shamcash_qr_image: str | None = None


class PublicShamCashResponse(BaseModel):
    shamcash_qr_image: str | None = None
    shamcash_receiver_name: str | None = None
    shamcash_account_number: str | None = None
