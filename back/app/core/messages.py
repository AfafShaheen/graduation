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
RESET_ATTEMPTS_EXCEEDED = "محاولات كثيرة خاطئة، يرجى طلب رمز جديد"
PASSWORD_RESET_SUCCESS = "تم تعيين كلمة السر الجديدة بنجاح"
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
REGISTRATION_NOT_OPEN = "لم يُفتح التسجيل لحفلك بعد"
REGISTRATION_CLOSED = "انتهت فترة التسجيل لحفلك"
COLLEGE_LINKED_TO_OTHER_EVENT = "الكلية مرتبطة بحفل آخر"
TICKET_ALREADY_EXISTS = "لديك تذكرة مسجلة مسبقاً"
THREE_COMPANIONS_DISABLED = "هذا النوع من التذاكر غير متاح لحفلك"
TICKET_CHOICE_NOT_CONFIRMED = "يجب تأكيد اختيار التذكرة قبل المتابعة"
NO_TICKET = "لا توجد تذكرة لهذا الحساب"
PAYMENT_NOT_ALLOWED = "لا يمكن إرسال بيانات الدفع في حالة التذكرة الحالية"
TRANSACTION_ALREADY_USED = "رقم العملية مسجل مسبقاً"
PAYMENT_SUBMITTED = "تم استلام بيانات الدفع، والاتحاد يراجعها حالياً"
REQUEST_NOT_PROCESSING = "هذا الطلب ليس قيد المعالجة"
REJECT_REASON_REQUIRED = "يجب كتابة سبب الرفض"
SCANNER_USERNAME_TAKEN = "اسم المستخدم مستخدم مسبقاً"
SCANNER_LOGIN_FAILED = "اسم المستخدم أو كلمة السر غير صحيحة"
SCANNER_NOT_FOUND = "لم يتم العثور على الماسح الضوئي"
SCANNER_DELETED = "تم حذف حساب الماسح الضوئي"
EVENT_NOT_FOUND = "لم يتم العثور على الحفل"
INVALID_IMAGE = "الصورة غير صالحة، المسموح PNG أو JPEG أو WEBP بحد أقصى 1 ميغابايت"
TICKET_INFO_TEXT = "التذكرة تمنحك أنت ومرافقيك دخول حفل التخرج. لا يمكن تعديل التذكرة أو استرجاع قيمتها بعد تأكيد الدفع."
SETTINGS_UPDATED = "تم تحديث الإعدادات بنجاح"
SHAMCASH_QR_UPDATED = "تم تحديث رمز دفع الشام كاش بنجاح"
SHAMCASH_QR_DELETED = "تم حذف رمز دفع الشام كاش"

TICKET_STATUS_AWAITING_PAYMENT = "تذكرتك بانتظار إتمام الدفع"
TICKET_STATUS_PROCESSING = "تم استلام بيانات دفعك والاتحاد يراجعها حالياً"
TICKET_STATUS_CONFIRMED = "تم تأكيد تذكرتك بنجاح"
TICKET_STATUS_REJECTED = "تم رفض بيانات الدفع، يمكنك إعادة إرسالها"

PAYMENT_CONFIRMED = "تم تأكيد الدفع بنجاح"
PAYMENT_REJECTED = "تم رفض الدفع"


def append_contact_phone(message: str, contact_phone: str | None) -> str:
    """Append the union contact number when the setting is configured (SRS FR-2)."""
    if contact_phone:
        return f"{message} رقم التواصل: {contact_phone}"
    return message


def payment_note_instruction(university_id: str) -> str:
    """Instruction shown to the graduate before transferring (SRS FR-9)."""
    return f"يرجى كتابة رقمك الجامعي ({university_id}) في خانة ملاحظة الحوالة"


# --- Audit log viewer (item 3.5.2, D22) --------------------------------------

AUDIT_ROLE_LABELS = {
    "ADMIN": "مسؤول الاتحاد",
    "SCANNER": "ماسح",
}

AUDIT_ACTION_LABELS = {
    "CREATE_EVENT": "إنشاء حفل",
    "UPDATE_EVENT": "تعديل حفل",
    "DELETE_EVENT": "حذف حفل",
    "UPLOAD_UNIVERSITY_RECORDS": "رفع سجلات جامعية",
    "DELETE_UNIVERSITY_RECORD": "حذف سجل جامعي",
    "UPDATE_EMAIL": "تعديل بريد إلكتروني",
    "MANUAL_CHECK_IN": "تسجيل دخول يدوي",
    "REVERT_SCAN": "إلغاء مسح خاطئ",
    "REVERT_PAYMENT": "إرجاع الدفع لقيد المعالجة",
    "PAYMENT_CONFIRMED": "تأكيد دفع",
    "PAYMENT_REJECTED": "رفض دفع",
    "SETTINGS_UPDATED": "تحديث الإعدادات",
    "SHAMCASH_QR_UPDATED": "تحديث رمز دفع الشام كاش",
    "SHAMCASH_QR_DELETED": "حذف رمز دفع الشام كاش",
    "SCANNER_CREATED": "إنشاء حساب ماسح",
    "SCANNER_DELETED": "حذف حساب ماسح",
    "DATA_EXPORTED": "تصدير بيانات",
    "qr_scanned": "محاولة مسح",
}


def audit_action_label(action: str) -> str:
    """Arabic label for an audit action; the raw code when it is unknown (D22)."""
    return AUDIT_ACTION_LABELS.get(action, action)


def audit_role_label(actor_type: str) -> str:
    """Arabic label for an audit actor type; the raw value when it is unknown."""
    return AUDIT_ROLE_LABELS.get(actor_type, actor_type)
