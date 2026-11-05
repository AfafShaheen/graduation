// "18:34:00" -> "6:34 م", "09:05" -> "9:05 ص". The server stores the time in 24 hours.
export function formatEventTime12(value) {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return String(value);
  const hours = Number(match[1]);
  if (hours > 23) return String(value);
  const suffix = hours >= 12 ? 'م' : 'ص';
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
}
