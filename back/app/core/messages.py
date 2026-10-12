"""Arabic user-facing messages shared across the backend.

Keep every new or touched message here so wording stays consistent and no
endpoint leaks which field mismatched (SRS FR-2, FR-6, NFR privacy).
"""

GENERIC_VERIFY_FAIL = "ما قدرنا نتحقق من بياناتك، يرجى مراجعتها أو التواصل مع الاتحاد"
REGISTER_FAIL = "تعذّر إكمال التسجيل، يرجى مراجعة بياناتك أو التواصل مع الاتحاد"
OTP_INVALID_GENERIC = "رمز التحقق غير صحيح أو منتهي الصلاحية"
EMAIL_SEND_FAIL = "تعذّر إرسال رمز التحقق حالياً، يرجى المحاولة بعد قليل"
REGISTER_PARTIAL = "تم إنشاء الحساب لكن تعذّر إرسال رمز التحقق، يرجى طلب إعادة الإرسال"
SERVICE_UNAVAILABLE = "الخدمة غير متاحة مؤقتاً، يرجى المحاولة لاحقاً"
PASSWORD_POLICY = "كلمة السر يجب ألا تقل عن 8 أحرف وأن تحتوي على حرف ورقم على الأقل"
VERIFY_RATE_LIMITED = "محاولات تحقق كثيرة، يرجى المحاولة بعد قليل"
ALREADY_CHECKED_IN = "تم تسجيل دخول الخريج مسبقاً"
NOTHING_TO_REVERT = "لا يوجد مسح لإلغائه"
PAYMENT_NOT_REVERTIBLE = "يمكن إلغاء الدفع فقط لتذكرة مؤكدة"
MANUAL_CHECKIN_TICKET_NOT_CONFIRMED = "التذكرة غير مؤكدة، لا يمكن تسجيل الدخول اليدوي"

SCAN_VALID = "رمز صالح"
SCAN_UNKNOWN = "رمز غير معروف"
SCAN_WRONG_EVENT = "الرمز يتبع حفلاً آخر"
SCAN_TICKET_NOT_CONFIRMED = "التذكرة غير مؤكدة"
SCAN_ALREADY_USED = "رمز مستخدم سابقاً"
SCAN_NOT_ACTIVATED = "رمز غير مفعَّل (رمز مرافق قبل الخريج)"


def append_contact_phone(message: str, contact_phone: str | None) -> str:
    """Append the union contact number when the setting is configured (SRS FR-2)."""
    if contact_phone:
        return f"{message} رقم التواصل: {contact_phone}"
    return message
