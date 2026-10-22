"""Request/response schemas for the scanner authentication and scan endpoints.

Kept separate from ``schemas.scanner`` (which the admin uses to manage scanner
accounts) so the public scan contract stays small and explicitly typed
(FR-23 / FR-24 / FR-25).
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.qr_code import QrCodeTypeEnum
from app.schemas.ticket import EventBrief


class ScannerLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)
    event_id: int | None = Field(None, gt=0)


class ScannerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    refresh_expires_in: int
    event: EventBrief


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(..., min_length=10)


class ScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64)

    @field_validator("code")
    @classmethod
    def _strip_code(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 64:
            raise ValueError("الرمز غير صالح")
        return value


class ScanResponse(BaseModel):
    """Business outcome of a scan (D13: always HTTP 200, never personal data)."""

    valid: bool
    decision: str
    message: str
    code_type: Optional[QrCodeTypeEnum] = None
