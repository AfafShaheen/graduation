// Pure helpers of the dashboard statistics page: formatting, labels and the links
// that open the graduates page with the filter matching a number. No React, no DOM.

export const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Whole percentage of part in total (0 when the total is 0).
export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

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
  if (left >= 86400000) return { closed: false, value: days, unit: days === 1 ? 'يوم' : days <= 10 ? 'أيام' : 'يوماً' };
  const hours = Math.max(1, Math.ceil(left / 3600000));
  return { closed: false, value: hours, unit: hours === 1 ? 'ساعة' : hours <= 10 ? 'ساعات' : 'ساعة' };
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

// Steps of the registration journey: how many people reached each one and how much
// of the first step that is (the bars of the funnel card).
export const FUNNEL_STEPS = [
  { key: 'accounts', label: 'أنشأوا حساباً', color: '#124d44' },
  { key: 'verified', label: 'أكدوا البريد', color: '#2f7a63' },
  { key: 'paid', label: 'أرسلوا الدفع', color: '#5fa08a' },
  { key: 'confirmed', label: 'تأكدت تذاكرهم', color: '#ca4b00' },
];

export function funnelSteps(funnel = {}) {
  const top = Number(funnel.accounts || 0);
  return FUNNEL_STEPS.map((s) => {
    const count = Number(funnel[s.key] || 0);
    return { ...s, count, share: pct(count, top) };
  });
}

// The line of the "registrations per day" card as SVG paths in a width x height box.
export function sparkline(points = [], width = 260, height = 80, pad = 6) {
  const values = points.map((p) => Number(p.count || 0));
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const coords = values.map((v, i) => [
    Math.round(i * step * 10) / 10,
    Math.round((height - pad - (v / max) * (height - pad * 2)) * 10) / 10,
  ]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const last = coords[coords.length - 1] || null;
  const area = coords.length ? `${line} L${last[0]} ${height} L0 ${height} Z` : '';
  const peak = points.reduce((best, p) => (Number(p.count) > Number(best?.count || 0) ? p : best), null);
  return { line, area, last, max, peak, total: values.reduce((a, b) => a + b, 0) };
}

// "2027-01-02T14:00" (Damascus hour from the server) -> "14:00".
export const hourLabel = (value) => String(value || '').slice(11, 16);

// "2026-11-03" -> "3/11"
export const dayLabel = (value) => {
  const [, m, d] = String(value || '').split('-');
  return m && d ? `${Number(d)}/${Number(m)}` : '';
};
