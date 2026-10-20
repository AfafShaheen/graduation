from sqlalchemy import Column, Integer, String, BigInteger, ForeignKey, DateTime, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.base import Base


class UniversityFileModel(Base):
    """ملف بيانات مرفوع من الأمانة العامة، مرتبط بحفل واحد (تصميم A — P6.1).

    الملف يُخزَّن على القرص (storage_path) وتُحفظ بياناته الوصفية هنا ليظهر في
    صفحة «ملفات البيانات» مع الحفل المرتبط وعدد الصفوف المستوردة والكليات.
    """

    __tablename__ = "university_files"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=False)
    content_type = Column(String(120), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    rows_total = Column(Integer, nullable=False, server_default=text("0"))
    rows_imported = Column(Integer, nullable=False, server_default=text("0"))
    rows_updated = Column(Integer, nullable=False, server_default=text("0"))
    rows_skipped = Column(Integer, nullable=False, server_default=text("0"))
    status = Column(String(20), nullable=False, server_default=text("'uploaded'"))
    uploaded_by = Column(Integer, ForeignKey("admins.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    event = relationship("EventModel", backref="university_files")
