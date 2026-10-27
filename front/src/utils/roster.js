// Pure helpers of the admin roster page ("الخريجون"): no React, no DOM, so they
// can be unit-tested with Node's built-in runner.

export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;

export const EMPTY_FILTERS = Object.freeze({
  search: '',
  fileId: '',
  collegeId: '',
  registration: '',
  topRank: '',
  ticket: '',
  payment: '',
  entry: '',
  ticketType: '',
});

// Filter option lists: the values are exactly what the API accepts.
export const REGISTRATION_OPTIONS = [
  { value: 'not_registered', label: 'لم يسجّل بعد' },
  { value: 'unverified', label: 'سجّل — بانتظار تأكيد البريد (OTP)' },
  { value: 'verified', label: 'سجّل — تم تأكيد البريد (OTP)' },
];

export const TOP_OPTIONS = [
  { value: 'any', label: 'من الأوائل (الكل)' },
  { value: '1', label: 'الأول' },
  { value: '2', label: 'الثاني' },
  { value: '3', label: 'الثالث' },
  { value: 'none', label: 'ليس من الأوائل' },
];

export const TICKET_OPTIONS = [
  { value: 'none', label: 'لا توجد تذكرة' },
  { value: 'awaiting_payment', label: 'بانتظار الدفع' },
  { value: 'processing', label: 'قيد المعالجة' },
  { value: 'confirmed', label: 'مؤكدة' },
  { value: 'rejected', label: 'مرفوضة' },
];

export const PAYMENT_OPTIONS = [
  { value: 'none', label: 'لم يُرسل دفع' },
  { value: 'pending', label: 'قيد المراجعة' },
  { value: 'confirmed', label: 'مؤكد' },
  { value: 'rejected', label: 'مرفوض' },
  { value: 'mismatch', label: 'مبلغ غير مطابق' },
];

export const ENTRY_OPTIONS = [
  { value: 'entered', label: 'دخل' },
  { value: 'not_entered', label: 'لم يدخل' },
];

export const TICKET_TYPE_OPTIONS = [
  { value: 'two', label: 'تذكرة بمرافقين' },
  { value: 'three', label: 'تذكرة بثلاثة مرافقين' },
];

const QUERY_KEYS = {
  search: 'search',
  fileId: 'file_id',
  collegeId: 'college_id',
  registration: 'registration',
  topRank: 'top_rank',
  ticket: 'ticket',
  payment: 'payment',
  entry: 'entry',
  ticketType: 'ticket_type',
};

const clean = (value) => (value === null || value === undefined ? '' : String(value).trim());

// Only the filters the admin actually set, under the API's parameter names.
export function buildRosterFilterQuery(filters = {}) {
  const query = {};
  Object.entries(QUERY_KEYS).forEach(([key, apiKey]) => {
    const value = clean(filters[key]);
    if (value) query[apiKey] = value;
  });
  return query;
}

export function buildRosterQuery(filters, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(Number(page)) || 1);
  const safeSize = Math.max(1, Math.floor(Number(pageSize)) || DEFAULT_PAGE_SIZE);
  return { ...buildRosterFilterQuery(filters), skip: (safePage - 1) * safeSize, limit: safeSize };
}

export function hasActiveFilters(filters = {}) {
  return Object.keys(buildRosterFilterQuery(filters)).length > 0;
}

// ----------------------------------------------------------------- pagination

export function pageCount(total, pageSize = DEFAULT_PAGE_SIZE) {
  const size = Math.max(1, Math.floor(Number(pageSize)) || DEFAULT_PAGE_SIZE);
  const count = Math.max(0, Math.floor(Number(total)) || 0);
  return Math.max(1, Math.ceil(count / size));
}

export function clampPage(page, total, pageSize = DEFAULT_PAGE_SIZE) {
  const last = pageCount(total, pageSize);
  const wanted = Math.floor(Number(page)) || 1;
  return Math.min(Math.max(1, wanted), last);
}

// Page numbers to display, with '…' for skipped ranges: always the first and
// last page and `span` pages on each side of the current one.
export function pageWindow(current, last, span = 2) {
  const total = Math.max(1, Math.floor(Number(last)) || 1);
  const now = Math.min(Math.max(1, Math.floor(Number(current)) || 1), total);
  const wanted = new Set([1, total]);
  for (let n = now - span; n <= now + span; n += 1) {
    if (n >= 1 && n <= total) wanted.add(n);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, index) => {
    if (index > 0) {
      const gap = n - sorted[index - 1];
      if (gap === 2) out.push(n - 1); // a single missing page is shown, not "…"
      else if (gap > 2) out.push('…');
    }
    out.push(n);
  });
  return out;
}

// "1–50 من 237" (empty list: "0 من 0").
export function rangeLabel(page, pageSize, total, shown) {
  const count = Math.max(0, Math.floor(Number(total)) || 0);
  const visible = Math.max(0, Math.floor(Number(shown)) || 0);
  if (count === 0 || visible === 0) return `0 من ${count}`;
  const size = Math.max(1, Math.floor(Number(pageSize)) || DEFAULT_PAGE_SIZE);
  const start = (Math.max(1, Math.floor(Number(page)) || 1) - 1) * size + 1;
  return `${start}–${start + visible - 1} من ${count}`;
}

// --------------------------------------------------------------------- labels

const RANK_NAMES = { 1: 'الأول', 2: 'الثاني', 3: 'الثالث' };

export const registrationLabel = (state) =>
  REGISTRATION_OPTIONS.find((o) => o.value === state)?.label || '—';

const TICKET_STATUS_LABELS = {
  AWAITING_PAYMENT: 'بانتظار الدفع',
  PROCESSING: 'قيد المعالجة',
  CONFIRMED: 'مؤكدة',
  REJECTED: 'مرفوضة',
};

export const ticketStatusLabel = (status) => TICKET_STATUS_LABELS[status] || '—';

export const paymentLabel = (state) =>
  PAYMENT_OPTIONS.find((o) => o.value === state)?.label || '—';

export function topLabel(item) {
  if (!item) return '—';
  if (item.top_rank && RANK_NAMES[item.top_rank]) return `من الأوائل — ${RANK_NAMES[item.top_rank]}`;
  return item.is_top ? 'من الأوائل' : '—';
}

export function entryLabel(entry) {
  if (!entry || !entry.entered) return 'لم يدخل';
  return entry.manual ? 'دخل (يدوي)' : 'دخل';
}

// Colour family of a badge: 'ok' | 'warn' | 'bad' | 'muted'.
export function badgeTone(kind, value) {
  const tones = {
    registration: { verified: 'ok', unverified: 'warn', not_registered: 'muted' },
    ticket: { CONFIRMED: 'ok', PROCESSING: 'warn', AWAITING_PAYMENT: 'muted', REJECTED: 'bad' },
    payment: { confirmed: 'ok', pending: 'warn', rejected: 'bad', none: 'muted' },
    entry: { entered: 'ok', not_entered: 'muted' },
  };
  return tones[kind]?.[value] || 'muted';
}
