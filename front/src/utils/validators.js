// مُتحقّقات الواجهة — مطابقة للخلفية تماماً (D5).
// المرجع: back/app/schemas/graduate.py (NAME_REGEX, PHONE_REGEX)
// و back/app/core/security.py (validate_password_policy).
// أي تعديل هنا يجب أن يطابقه تعديل في الخلفية.

export const NAME_REGEX = /^[\u0600-\u06FFa-zA-Z\s]{2,255}$/;
export const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_POLICY_MESSAGE =
  "كلمة السر يجب ألا تقل عن 8 أحرف وأن تحتوي على حرف ورقم على الأقل";

// مكافئ str.isalpha()/str.isdigit() في بايثون: أي حرف/رقم بأي لغة.
const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

function utf8Length(value) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
}

export function isValidName(value) {
  return typeof value === "string" && NAME_REGEX.test(value.trim());
}

export function isValidPhone(value) {
  return typeof value === "string" && PHONE_REGEX.test(value.trim());
}

export function isValidPassword(value) {
  if (typeof value !== "string") return false;
  if (value.length < PASSWORD_MIN_LENGTH) return false;
  if (!LETTER.test(value) || !DIGIT.test(value)) return false;
  return utf8Length(value) <= PASSWORD_MAX_BYTES;
}

// دوال ترجع نص الخطأ (أو نصاً فارغاً عند الصحة) لاستخدامها في النماذج.
export function nameError(value) {
  const v = (value || "").trim();
  if (!v) return "يرجى إدخال الاسم";
  return isValidName(v) ? "" : "يُسمح بالحروف العربية أو الإنجليزية والمسافات فقط";
}

export function phoneError(value) {
  const v = (value || "").trim();
  if (!v) return "يرجى إدخال رقم الهاتف";
  if (!/^\+?\d+$/.test(v)) return "يجب أن يكون رقم الهاتف أرقاماً فقط، مع إمكانية البدء بـ +";
  return isValidPhone(v) ? "" : "يجب أن يتكون رقم الهاتف من 7 إلى 15 رقماً";
}

export function passwordError(value) {
  if (!value) return "يرجى إدخال كلمة السر";
  return isValidPassword(value) ? "" : PASSWORD_POLICY_MESSAGE;
}

/* ===== مدقّقات إعدادات الإدارة (B5.1) — مطابقة حرفية لرسائل الخلفية A1 ===== */
/* المرجع: back/app/schemas/settings_admin.py + back/app/core/messages.py   */

export const SETTINGS_ACCOUNT_INVALID =
  "رقم الحساب يقبل أحرفاً وأرقاماً إنجليزية فقط (من 4 إلى 100 خانة) بدون مسافات أو رموز";
export const SETTINGS_RECEIVER_INVALID =
  "اسم المستفيد يقبل حروفاً عربية أو إنجليزية ومسافات فقط (من حرفين إلى 200)";
export const SETTINGS_PHONE_INVALID =
  "رقم الهاتف يجب أن يتكون من أرقام فقط (من 7 إلى 15 رقماً) ويمكن أن يبدأ بعلامة +";

// D1: حروف لاتينية وأرقام فقط، بلا مسافات أو رموز، 4 إلى 100.
const ACCOUNT_REGEX = /^[A-Za-z0-9]{4,100}$/;
// D2: حروف عربية/لاتينية ومسافات و . - ' فقط، بلا أرقام، 2 إلى 200 بعد trim.
const RECEIVER_REGEX = /^[\u0600-\u06FFa-zA-Z .'-]{2,200}$/;

/**
 * @param {string|null|undefined} value
 * @returns {string} نص الخطأ بالعربية، أو '' إذا القيمة صالحة أو فارغة (فارغ = مسح الإعداد)
 */
export function validateShamCashAccount(value) {
  const v = String(value ?? "").trim();
  if (!v) return ""; // الفراغ يعني "امسح الحقل" كما في الخلفية
  if (!ACCOUNT_REGEX.test(v)) return SETTINGS_ACCOUNT_INVALID;
  return "";
}

export function validateReceiverName(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (!RECEIVER_REGEX.test(v)) return SETTINGS_RECEIVER_INVALID;
  return "";
}

export function validateSupportPhone(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (!PHONE_REGEX.test(v)) return SETTINGS_PHONE_INVALID;
  return "";
}
