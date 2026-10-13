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
INVALID_IMAGE = "الصورة غير صالحة، المسموح PNG أو JPEG أو WEBP بحد أقصى 1 ميغابايت"
TICKET_INFO_TEXT = "التذكرة تمنحك أنت ومرافقيك دخول حفل التخرج. لا يمكن تعديل التذكرة أو استرجاع قيمتها بعد تأكيد الدفع."
SETTINGS_UPDATED = "تم تحديث الإعدادات بنجاح"
SHAMCASH_QR_UPDATED = "تم تحديث رمز دفع الشام كاش بنجاح"
SHAMCASH_QR_DELETED = "تم حذف رمز دفع الشام كاش"


def append_contact_phone(message: str, contact_phone: str | None) -> str:
    """Append the union contact number when the setting is configured (SRS FR-2)."""
    if contact_phone:
        return f"{message} رقم التواصل: {contact_phone}"
    return message
