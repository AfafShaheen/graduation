from typing import List

from pydantic import BaseModel, ConfigDict, Field


class CollegeCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)


class CollegeUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)


class CollegeMajorItem(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CollegeEventItem(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CollegeResponse(BaseModel):
    id: int
    name: str
    majors: List[CollegeMajorItem] = []
    events: List[CollegeEventItem] = []
    model_config = ConfigDict(from_attributes=True)
