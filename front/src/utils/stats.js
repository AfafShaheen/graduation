// Pure helpers of the dashboard statistics page: formatting, labels and the links
// that open the graduates page with the filter matching a number. No React, no DOM.

export const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Whole percentage of part in total (0 when the total is 0).
export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

// Syrian pounds. The API sends decimal strings such as "13500000.00".
export function money(value) {
  const n = Number(value || 0);
  const text = Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} ل.س`;
}

// The five exclusive states of a confirmed account in one ceremony (colours of the app).
export const STATUS_SEGMENTS = [
  { key: 'confirmed', label: 'مؤكدة', color: '#124d44', ticket: 'confirmed' },
  { key: 'processing', label: 'قيد المراجعة', color: '#ca4b00', ticket: 'processing' },
  { key: 'awaiting_payment', label: 'بانتظار الدفع', color: '#b9a79e', ticket: 'awaiting_payment' },
  { key: 'rejected', label: 'مرفوضة', color: '#ba1a1a', ticket: 'rejected' },
  { key: 'no_ticket', label: 'بدون تذكرة', color: '#e2bfb2', ticket: 'none' },
];

export function statusSegments(status = {}) {
  const total = STATUS_SEGMENTS.reduce((sum, s) => sum + Number(status[s.key] || 0), 0);
  return STATUS_SEGMENTS.map((s) => {
    const count = Number(status[s.key] || 0);
    return { ...s, count, share: total > 0 ? (count / total) * 100 : 0 };
  });
}

export const statusTotal = (status = {}) =>
  STATUS_SEGMENTS.reduce((sum, s) => sum + Number(status[s.key] || 0), 0);

// "منذ 5 ساعات" / "منذ ساعة" / "منذ يومين" for the oldest pending request.
export function ageLabel(hours) {
  if (hours === null || hours === undefined) return '';
  const h = Number(hours);
  if (h < 1) return 'أقل من ساعة';
  if (h < 48) {
    const n = Math.floor(h);
    if (n === 1) return 'ساعة';
    if (n === 2) return 'ساعتين';
    return n <= 10 ? `${n} ساعات` : `${n} ساعة`;
  }
  const d = Math.floor(h / 24);
  return d <= 10 ? `${d} أيام` : `${d} يوماً`;
}

// Time left before registration closes, from the server clock (not the browser's).
export function closeIn(registration, generatedAt) {
  if (!registration || !registration.ends_at) return { closed: true, value: '', unit: '' };
  const left = new Date(registration.ends_at).getTime() - new Date(generatedAt).getTime();
  if (!(left > 0)) return { closed: true, value: '', unit: '' };
  const days = Math.ceil(left / 86400000);
  if (left >= 86400000) return { closed: false, value: days, unit: days === 1 ? 'يوم' : 'أيام' };
  const hours = Math.max(1, Math.ceil(left / 3600000));
  return { closed: false, value: hours, unit: hours === 1 ? 'ساعة' : 'ساعات' };
}

// Rate of a college: confirmed ÷ expected, and the colour family of its bar.
export const collegeRate = (college) => pct(college.confirmed, college.expected);
export const rateTone = (rate) => (rate >= 60 ? 'good' : rate >= 35 ? 'mid' : 'low');

export const COLLEGE_SORTS = {
  lowest: (a, b) => collegeRate(a) - collegeRate(b) || a.name.localeCompare(b.name, 'ar'),
  highest: (a, b) => collegeRate(b) - collegeRate(a) || a.name.localeCompare(b.name, 'ar'),
  name: (a, b) => a.name.localeCompare(b.name, 'ar'),
};

export function sortColleges(colleges, sort = 'lowest') {
  const compare = COLLEGE_SORTS[sort] || COLLEGE_SORTS.lowest;
  return [...colleges].sort(compare);
}

// The section path of the graduates page with the filter that matches a number,
// e.g. actions?event_id=3&registration=verified&ticket=confirmed
export function drillSection(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `actions?${query}` : 'actions';
}

export const VERIFIED = { registration: 'verified' };

// Each statistic and the roster filter that lists exactly the people behind it.
export function drillFilters(kind, eventId) {
  const event = eventId ? { event_id: eventId } : {};
  const map = {
    processing: { ...VERIFIED, ticket: 'processing' },
    rejected: { ...VERIFIED, ticket: 'rejected' },
    unverified: { registration: 'unverified' },
    confirmed: { ...VERIFIED, ticket: 'confirmed' },
    awaiting_payment: { ...VERIFIED, ticket: 'awaiting_payment' },
    no_ticket: { ...VERIFIED, ticket: 'none' },
    registered: { ...VERIFIED },
    entered: { ...VERIFIED, ticket: 'confirmed', entry: 'entered' },
    top: { ...VERIFIED, top_rank: 'any' },
  };
  return { ...event, ...(map[kind] || {}) };
}
