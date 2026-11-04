// Where the graduate stands in time: registration not open yet, open, closed, or the ceremony is over.
import { daysUntil } from './countdown.js';

export function ceremonyEnded(eventDate, now = new Date()) {
  const days = daysUntil(eventDate, now);
  return days !== null && days < 0;
}

const dateLabel = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Damascus',
  }).format(date);
};

export const ENDED_TEXT = 'انتهى حفل التخرج ولم يعد التسجيل متاحاً. شكراً لمتابعتكم.';
export const CLOSED_TEXT = 'لم يعد التسجيل متاحاً لهذه الدفعة. يرجى متابعة الإعلانات الرسمية.';

// kind: open | not_started | closed | ended (headline and body are what the package page shows)
export function registrationNotice(registration, eventDate, now = new Date()) {
  if (ceremonyEnded(eventDate, now)) return { kind: 'ended', headline: 'انتهى الحفل', body: ENDED_TEXT };
  if (registration?.is_open) return { kind: 'open', headline: '', body: '' };
  const start = registration?.start ? new Date(registration.start).getTime() : null;
  if (start && start > now.getTime()) {
    const when = dateLabel(registration.start);
    return {
      kind: 'not_started',
      headline: 'التسجيل لم يبدأ بعد',
      body: when ? `يفتح التسجيل بتاريخ ${when}.` : 'يرجى متابعة الإعلانات الرسمية.',
    };
  }
  return { kind: 'closed', headline: 'التسجيل مغلق', body: CLOSED_TEXT };
}

export const ENDED_PENDING_TEXT = 'إن كان لديك استفسار عن دفعتك فتواصل معنا على الواتساب (الرقم في أسفل الصفحة).';
export const ENDED_REJECTED_TEXT = 'لم يعد بالإمكان إعادة إرسال الدفع. للاستفسار تواصل معنا على الواتساب (الرقم في أسفل الصفحة).';
