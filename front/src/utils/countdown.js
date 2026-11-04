// Day counts shown to the graduate: days to the ceremony and time left to register.
// Days are counted on the calendar of Damascus, like every date of the system.
import { countLabel } from './countLabel.js';

const DAMASCUS = 'Asia/Damascus';

function damascusDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAMASCUS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// whole days from today (Damascus) to the ceremony date "YYYY-MM-DD"; null when unknown
export function daysUntil(eventDate, now = new Date()) {
  const target = Date.parse(`${eventDate}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  return Math.round((target - Date.parse(`${damascusDay(now)}T00:00:00Z`)) / 86400000);
}

export function eventCountdownText(days) {
  if (days === null || days === undefined || days < 0) return '';
  if (days === 0) return 'الحفل اليوم';
  return `باقي ${countLabel(days, 'يوم', 'يومان', 'أيام', 'يوماً')} على الحفل`;
}

export function closesInText(endIso, now = new Date()) {
  const left = new Date(endIso).getTime() - now.getTime();
  if (!(left > 0)) return '';
  const days = Math.floor(left / 86400000);
  if (days >= 1) return `يُغلق التسجيل بعد ${countLabel(days, 'يوم', 'يومان', 'أيام', 'يوماً')}`;
  const hours = Math.max(1, Math.ceil(left / 3600000));
  return `يُغلق التسجيل بعد ${countLabel(hours, 'ساعة', 'ساعتان', 'ساعات', 'ساعة', 'واحدة')}`;
}
