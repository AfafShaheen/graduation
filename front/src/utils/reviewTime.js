// Review time of a sent payment, shown as facts that do not tick on the screen:
// the time it was sent, the usual range, and a prepared WhatsApp message after 24 hours.
import { whatsappHref } from '../components/helpFooterLogic.js';

export const REVIEW_USUAL_TEXT = 'تستغرق المراجعة عادةً من ساعتين إلى 24 ساعة.';
export const REVIEW_LIMIT_HOURS = 24;

export function hoursSince(iso, now = Date.now()) {
  const sent = new Date(iso).getTime();
  if (Number.isNaN(sent)) return null;
  return Math.max(0, (now - sent) / 3600000);
}

export const isReviewDelayed = (iso, now = Date.now(), limit = REVIEW_LIMIT_HOURS) => {
  const hours = hoursSince(iso, now);
  return hours !== null && hours >= limit;
};

// "الثلاثاء 3 تشرين الثاني 2026، 3:20 م" (Damascus time, Latin digits)
export function sentAtLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Damascus',
  }).format(date);
}

export const DELAY_MESSAGE = 'مرحباً، أرسلت دفعتي منذ أكثر من 24 ساعة ولم يتم تأكيد تذكرتي بعد، أرجو المساعدة.';

// wa.me link with the delay message written in advance (null when no support number is set)
export function delayWhatsappHref(phone) {
  const base = whatsappHref(phone);
  return base ? `${base}?text=${encodeURIComponent(DELAY_MESSAGE)}` : null;
}
