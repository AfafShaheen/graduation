from pydantic import BaseModel, Field


class AdminSettingsUpdate(BaseModel):
    contact_phone: str | None = Field(default=None, max_length=50)
    shamcash_receiver_name: str | None = Field(default=None, max_length=200)
    shamcash_account_number: str | None = Field(default=None, max_length=100)


class AdminSettingsResponse(BaseModel):
    contact_phone: str | None = None
    shamcash_receiver_name: str | None = None
    shamcash_account_number: str | None = None
    shamcash_qr_image: str | None = None


class PublicShamCashResponse(BaseModel):
    shamcash_qr_image: str | None = None
    shamcash_receiver_name: str | None = None
    shamcash_account_number: str | None = None
