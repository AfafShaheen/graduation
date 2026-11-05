// The dates of a ceremony as the admin types them: the ceremony itself and the registration
// window, all as "YYYY-MM-DDTHH:mm" in Damascus time. Strings of this shape sort like times.

export const END_AFTER_START = 'يجب أن تكون نهاية التسجيل بعد بدايته.';
export const END_BEFORE_CEREMONY = 'يجب أن تنتهي فترة التسجيل قبل موعد الحفل أو عنده.';
export const START_BEFORE_CEREMONY = 'يجب أن تبدأ فترة التسجيل قبل موعد الحفل.';

// "2030-05-01T09:00:00+03:00" (any zone) -> "2030-05-01T09:00" on the clock of Damascus; '' if unreadable
export function toDamascusLocal(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Damascus',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// A date-only value (an old saved draft, or an event written before times existed) gets a default time.
export function normalizeLocal(value, defaultTime) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T${defaultTime}`;
  return text.length >= 16 ? text.slice(0, 16) : text;
}

// The two rules, with the message that belongs under the field that is wrong:
//  1. the registration ends after it starts, 2. it ends before the ceremony or exactly at it.
export function windowErrors({ ceremony, start, end }) {
  const errors = {};
  const ceremonyKey = ceremony ? String(ceremony).slice(0, 16) : '';
  if (start && end && end <= start) errors.registration_end = END_AFTER_START;
  if (ceremonyKey && end && end > ceremonyKey && !errors.registration_end) {
    errors.registration_end = END_BEFORE_CEREMONY;
  }
  if (ceremonyKey && start && start >= ceremonyKey && !errors.registration_end) {
    errors.registration_start = START_BEFORE_CEREMONY;
  }
  return errors;
}

// the value the server wants: "2030-05-01T09:00" -> "2030-05-01T09:00:00+03:00"
export function toServerDateTime(local) {
  return local ? `${local}:00+03:00` : local;
}
