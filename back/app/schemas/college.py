from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class CollegeCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    event_id: int

class CollegeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    event_id: Optional[int] = None

class CollegeResponse(CollegeCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)
