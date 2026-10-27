from pydantic import BaseModel, Field, ConfigDict
from typing import List

class MajorPublicItem(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

class RegistrationCollegeItem(BaseModel):
    id: int
    name: str
    event_id: int
    majors: List[MajorPublicItem] = []
    model_config = ConfigDict(from_attributes=True)

class MajorCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)

class MajorUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)

class MajorAdminResponse(BaseModel):
    id: int
    name: str
    college_id: int
    model_config = ConfigDict(from_attributes=True)
