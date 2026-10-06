from pydantic import BaseModel, Field, ConfigDict

class SettingCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    value: str

class SettingUpdate(BaseModel):
    value: str

class SettingResponse(SettingCreate):
    model_config = ConfigDict(from_attributes=True)
