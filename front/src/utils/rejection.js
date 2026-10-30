// دوال صفحة الرفض النقية (قرارات D5/D6): لا React ولا DOM هنا حتى تُختبر مباشرة بـ node --test.
// قاعدة الهاتف مطابقة لبقية المشروع: + اختياري ثم 7 إلى 15 رقماً (انظر utils/validators.js).
import { PHONE_REGEX } from './validators.js';

// الفallback للأسباب القديمة التي بلا سبب (القرار D6) — نص واحد هنا لتبقى الصفحة والاختبارات متطابقة.
export const REJECTION_REASON_FALLBACK =
  'لم يُرفق سبب للرفض. يمكنك التواصل مع الدعم للاستفسار.';

// تحويل رقم الدعم إلى رابط tel: — يُزال منه الفراغات والشرطات؛ إن لم يطابق القاعدة النتيجة null.
export function supportHref(phone) {
  if (typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[\s-]/g, '');
  if (!cleaned || !PHONE_REGEX.test(cleaned)) return null;
  return `tel:${cleaned}`;
}

// سبب الرفض كما كُتب على شاشة الإدارة (D2) بعد trim؛ أو نص D6 الافتراضي إن كان فارغاً/مفقوداً.
export function rejectionReasonText(ticket) {
  const raw = ticket && typeof ticket.rejection_reason === 'string' ? ticket.rejection_reason : '';
  const trimmed = raw.trim();
  return trimmed || REJECTION_REASON_FALLBACK;
}

// خيارات الخريج بعد الرفض (القرار D5):
// - إعادة الدفع تظهر فقط بينما التسجيل مفتوح.
// - تواصل مع الدعم رابط tel: إذا كان رقم الدعم مضبوطاً، وإلا نص «تواصل مع مكتب الاتحاد.» بلا رابط.
// - عند إغلاق التسجيل تظهر الجملة: انتهت فترة التسجيل، لم يعد إعادة الدفع متاحاً.
export function rejectionActions({ registrationOpen, phone }) {
  const canResubmit = Boolean(registrationOpen);
  const href = supportHref(phone);
  const callHref = href ?? null;
  const showClosedNotice = !canResubmit;
  const showOfficeText = callHref === null;
  return { canResubmit, callHref, showClosedNotice, showOfficeText };
}
