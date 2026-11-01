// دوال صفحة الرفض النقية (قرارات D5/D6): لا React ولا DOM هنا حتى تُختبر مباشرة بـ node --test.
// قاعدة الهاتف مطابقة لبقية المشروع: + اختياري ثم 7 إلى 15 رقماً (انظر utils/validators.js).
import { PHONE_REGEX } from './validators.js';

// الفallback للأسباب القديمة التي بلا سبب (القرار D6) — نص واحد هنا لتبقى الصفحة والاختبارات متطابقة.
export const REJECTION_REASON_FALLBACK =
  'لم يُرفق سبب للرفض. تواصل معنا على الواتساب للاستفسار.';

// تحويل رقم الدعم إلى رابط واتساب — يُزال منه الفراغات والشرطات؛ إن لم يطابق القاعدة النتيجة null.
export function supportHref(phone) {
  if (typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[\s-]/g, '');
  if (!cleaned || !PHONE_REGEX.test(cleaned)) return null;
  const internationalNumber = cleaned.startsWith('+')
    ? cleaned.slice(1)
    : cleaned.startsWith('0')
      ? `963${cleaned.slice(1)}`
      : cleaned;
  return `https://wa.me/${internationalNumber}`;
}

// سبب الرفض كما كُتب على شاشة الإدارة (D2) بعد trim؛ أو نص D6 الافتراضي إن كان فارغاً/مفقوداً.
export function rejectionReasonText(ticket) {
  const raw = ticket && typeof ticket.rejection_reason === 'string' ? ticket.rejection_reason : '';
  const trimmed = raw.trim();
  return trimmed || REJECTION_REASON_FALLBACK;
}

// خيارات الخريج بعد الرفض (القرار D5):
// - إعادة الدفع تظهر فقط بينما التسجيل مفتوح.
// - تواصل معنا على الواتساب إذا كان رقم الدعم مضبوطاً، وإلا نص «تواصل معنا على الواتساب.» بلا رابط.
// - عند إغلاق التسجيل تظهر الجملة: انتهت فترة التسجيل، لم يعد إعادة الدفع متاحاً.
export function rejectionActions({ registrationOpen, phone }) {
  const canResubmit = Boolean(registrationOpen);
  const href = supportHref(phone);
  const callHref = href ?? null;
  const showClosedNotice = !canResubmit;
  const showOfficeText = callHref === null;
  return { canResubmit, callHref, showClosedNotice, showOfficeText };
}
