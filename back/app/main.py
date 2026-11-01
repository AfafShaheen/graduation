import os
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.redis import redis_client
from app.routers import graduates, auth, admin_graduates, admin_university_records, admin_university_files, admin_auth, admin_events, admin_settings, admin_payments, admin_scanners, admin_stats, admin_export, admin_audit, admin_volunteers, scanner, graduate_auth, public, admin_majors, admin_roster

app = FastAPI(
    title="Graduation Ticket System API",
    description="API for issuing and scanning graduation ceremony tickets.",
    version="1.0.0",
)

_VALIDATION_FIELD_LABELS = {
    "college_id": "الكلية",
    "university_id": "الرقم الجامعي",
    "first_name": "الاسم",
    "last_name": "الكنية",
    "full_name": "الاسم الكامل",
    "father_name": "اسم الأب",
    "mother_name": "اسم الأم",
    "gender": "الجنس",
    "major_id": "التخصص",
    "gpa": "المعدل",
    "top_rank": "ترتيب الأوائل",
    "registration_token": "رمز التسجيل",
    "email": "البريد الإلكتروني",
    "phone": "رقم الهاتف",
    "password": "كلمة السر",
    "new_password": "كلمة السر الجديدة",
    "code": "رمز التحقق",
    "companions_count": "عدد المرافقين",
    "transaction_number": "رقم العملية",
    "amount": "المبلغ",
    "sender_name": "اسم المرسل",
    "name": "اسم الحفل",
    "event_date": "تاريخ الحفل",
    "event_time": "وقت الحفل",
    "registration_start": "بداية التسجيل",
    "registration_end": "نهاية التسجيل",
    "whatsapp_group_link": "رابط مجموعة واتساب",
    "packages": "الباقات",
    "college_names": "الكليات",
    "seat_prefix": "بادئة المقاعد",
    "reason": "سبب الرفض",
    "username": "اسم المستخدم",
    "event_id": "الحفل",
    "refresh_token": "رمز تحديث الجلسة",
}


def _validation_field(error: dict) -> str | None:
    location = error.get("loc") or ()
    for part in reversed(location):
        if isinstance(part, str) and part not in {"body", "query", "path", "header"}:
            return part
    return None


def _localized_validation_message(error: dict) -> str:
    message = str(error.get("msg") or "").strip()
    if message.lower().startswith("value error"):
        message = message.split(",", 1)[-1].strip()
    if any("\u0600" <= char <= "\u06ff" for char in message):
        return message

    field = _validation_field(error)
    label = _VALIDATION_FIELD_LABELS.get(field or "", "القيمة المدخلة")
    error_type = error.get("type", "")

    if error_type == "missing":
        return f"{label} مطلوب."
    if error_type in {"string_too_short", "list_too_short"}:
        return f"{label} أقصر من الحد المسموح."
    if error_type in {"string_too_long", "list_too_long"}:
        return f"{label} أطول من الحد المسموح."
    if "registration end date cannot be before" in message.lower():
        return "تاريخ نهاية التسجيل يجب ألا يكون قبل تاريخ بداية التسجيل."
    if error_type in {"string_pattern_mismatch", "value_error", "literal_error"}:
        return f"صيغة {label} غير صحيحة."
    if error_type in {"int_parsing", "float_parsing", "decimal_parsing", "bool_parsing"}:
        return f"قيمة {label} غير صالحة."
    if error_type in {"greater_than", "greater_than_equal", "less_than", "less_than_equal"}:
        return f"قيمة {label} خارج المجال المسموح."
    if error_type in {"date_parsing", "datetime_parsing", "time_parsing"}:
        return f"صيغة {label} غير صحيحة."
    if error_type == "extra_forbidden":
        return f"الحقل {label} غير متوقع."
    return f"قيمة {label} غير صالحة."


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    del request
    errors = [
        {
            "loc": list(error.get("loc") or []),
            "msg": _localized_validation_message(error),
            "type": error.get("type", "validation_error"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "detail": errors,
            "message": "يرجى تصحيح الحقول المحددة ثم إعادة المحاولة.",
        },
    )

_cors_origins = [
    origin.strip()
    for origin in (os.getenv("CORS_ORIGINS") or "").split(",")
    if origin.strip()
] or ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

from app.models import all_models  # noqa: F401  (registers every model, including MajorModel)
from sqlalchemy.orm import configure_mappers; configure_mappers()

app.include_router(graduates.router)
app.include_router(auth.router)
app.include_router(admin_graduates.router)
app.include_router(admin_university_records.router)
app.include_router(admin_university_files.router)
app.include_router(admin_auth.router)
app.include_router(admin_events.router)
app.include_router(admin_settings.router)
app.include_router(admin_payments.router)
app.include_router(admin_scanners.router)
app.include_router(admin_stats.router)
app.include_router(admin_export.router)
app.include_router(admin_audit.router)
app.include_router(admin_volunteers.router)
app.include_router(scanner.router)
app.include_router(graduate_auth.router)
app.include_router(public.router)
app.include_router(admin_majors.router)
app.include_router(admin_roster.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Graduation Ticket System API"}

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    details = {"database": "ok", "redis": "ok"}
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        details["database"] = "error"
    try:
        await redis_client.ping()
    except Exception:
        details["redis"] = "error"

    healthy = all(value == "ok" for value in details.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "healthy" if healthy else "unhealthy",
            "details": details,
        },
    )
