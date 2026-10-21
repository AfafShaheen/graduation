"""Aggregate module that registers every ORM model on ``Base.metadata``.

Alembic reads the metadata from here so that, when a model is added or
changed, its table is known to the migration environment.
"""

from app.models import (
    AdminModel,
    AuditLogModel,
    Base,
    CollegeModel,
    EventModel,
    EventTicketPackageModel,
    GraduateModel,
    MajorModel,
    OtpCodeModel,
    PaymentModel,
    QrCodeModel,
    ScannerModel,
    SettingModel,
    TicketModel,
    UniversityFileModel,
    UniversityRecordModel,
    VolunteerAnswerModel,
)

__all__ = [
    "Base",
    "AdminModel",
    "AuditLogModel",
    "CollegeModel",
    "EventModel",
    "EventTicketPackageModel",
    "GraduateModel",
    "MajorModel",
    "OtpCodeModel",
    "PaymentModel",
    "QrCodeModel",
    "ScannerModel",
    "SettingModel",
    "TicketModel",
    "UniversityFileModel",
    "UniversityRecordModel",
    "VolunteerAnswerModel",
]
