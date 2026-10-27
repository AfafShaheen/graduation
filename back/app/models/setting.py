from sqlalchemy import Column, String, Text
from app.models.base import Base

class SettingModel(Base):
    __tablename__ = "settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text, nullable=False)
