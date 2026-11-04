// How the admin roster page shows its filters and its columns. Pure helpers, no React.
import {
  REGISTRATION_OPTIONS,
  TOP_OPTIONS,
  TICKET_OPTIONS,
  PAYMENT_OPTIONS,
  ENTRY_OPTIONS,
  TICKET_TYPE_OPTIONS,
} from './roster.js';

// ----------------------------------------------------------------- quick status chips
// Each chip sets the same "registration" and "ticket" filters the statistics page links use.
export const QUICK_STATUSES = [
  { key: 'all', label: 'الكل', set: { registration: '', ticket: '' } },
  { key: 'processing', label: 'بانتظار مراجعتك', warn: true, set: { registration: 'verified', ticket: 'processing' } },
  { key: 'awaiting_payment', label: 'بانتظار الدفع', set: { registration: 'verified', ticket: 'awaiting_payment' } },
  { key: 'confirmed', label: 'مؤكدة', set: { registration: 'verified', ticket: 'confirmed' } },
  { key: 'rejected', label: 'مرفوضة', set: { registration: 'verified', ticket: 'rejected' } },
  { key: 'unverified', label: 'بانتظار تأكيد البريد', set: { registration: 'unverified', ticket: '' } },
  { key: 'not_registered', label: 'لم يسجّل', set: { registration: 'not_registered', ticket: '' } },
];

// The chip that matches the current filters, or null when the combination is not a chip
// (then the "registration" and "ticket" lists of the extra filters show it).
export function activeQuick(filters = {}) {
  const registration = filters.registration || '';
  const ticket = filters.ticket || '';
  const hit = QUICK_STATUSES.find((q) => q.set.registration === registration && q.set.ticket === ticket);
  return hit ? hit.key : null;
}

export function applyQuick(filters, key) {
  const quick = QUICK_STATUSES.find((q) => q.key === key);
  return quick ? { ...filters, ...quick.set } : filters;
}

// ----------------------------------------------------------------- extra filters
export const EXTRA_FILTERS = [
  { key: 'registration', label: 'التسجيل', options: REGISTRATION_OPTIONS },
  { key: 'ticket', label: 'التذكرة', options: TICKET_OPTIONS },
  { key: 'topRank', label: 'الأوائل', options: TOP_OPTIONS },
  { key: 'payment', label: 'الدفع', options: PAYMENT_OPTIONS },
  { key: 'entry', label: 'الدخول', options: ENTRY_OPTIONS },
  { key: 'ticketType', label: 'نوع التذكرة', options: TICKET_TYPE_OPTIONS },
];

// Extra filters that are set. registration/ticket only count when they are not a quick chip.
export function activeExtras(filters = {}) {
  const quick = activeQuick(filters) !== null;
  return EXTRA_FILTERS.filter((f) => {
    if (!filters[f.key]) return false;
    return !(quick && (f.key === 'registration' || f.key === 'ticket'));
  }).map((f) => ({
    key: f.key,
    label: `${f.label}: ${f.options.find((o) => o.value === filters[f.key])?.label || filters[f.key]}`,
  }));
}

// ----------------------------------------------------------------- columns
export const ROSTER_COLUMNS = [
  { key: 'name', label: 'الخريج', fixed: true },
  { key: 'college', label: 'الكلية والتخصص' },
  { key: 'status', label: 'الحالة' },
  { key: 'top', label: 'الأوائل' },
  { key: 'registration', label: 'التسجيل' },
  { key: 'ticket', label: 'التذكرة' },
  { key: 'payment', label: 'الدفع' },
  { key: 'entry', label: 'الدخول' },
];

export const DEFAULT_COLUMNS = ['name', 'college', 'status', 'entry'];
export const COLUMNS_STORAGE_KEY = 'admin.roster.columns';

// Keeps only known columns, in the table's own order, and never drops the name.
export function sanitizeColumns(list) {
  const wanted = new Set(Array.isArray(list) ? list : []);
  const kept = ROSTER_COLUMNS.filter((c) => c.fixed || wanted.has(c.key)).map((c) => c.key);
  return kept.length > 1 ? kept : [...DEFAULT_COLUMNS];
}

export function loadColumns(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    const raw = storage?.getItem(COLUMNS_STORAGE_KEY);
    return raw ? sanitizeColumns(JSON.parse(raw)) : [...DEFAULT_COLUMNS];
  } catch {
    return [...DEFAULT_COLUMNS];
  }
}

export function saveColumns(columns, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    storage?.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(sanitizeColumns(columns)));
  } catch {
    /* storage not available */
  }
}

export function toggleColumn(columns, key) {
  const column = ROSTER_COLUMNS.find((c) => c.key === key);
  if (!column || column.fixed) return sanitizeColumns(columns);
  const next = columns.includes(key) ? columns.filter((k) => k !== key) : [...columns, key];
  return sanitizeColumns(next);
}

// ----------------------------------------------------------------- one status for the row
// The "الحالة" column: the most useful single state of a person, and a small line under it.
export function statusSummary(item) {
  const registration = item?.registration?.state;
  if (registration === 'not_registered' || !registration) return { label: 'لم يسجّل بعد', tone: 'muted', sub: '' };
  if (registration === 'unverified') return { label: 'بانتظار تأكيد البريد', tone: 'warn', sub: '' };
  const ticket = item.ticket;
  if (!ticket) return { label: 'بدون تذكرة', tone: 'muted', sub: '' };
  const mismatch = item.payment?.mismatch ? 'المبلغ غير مطابق' : '';
  switch (ticket.status) {
    case 'CONFIRMED':
      return { label: 'تذكرة مؤكدة', tone: 'ok', sub: '' };
    case 'PROCESSING':
      return { label: 'بانتظار مراجعتك', tone: 'warn', sub: mismatch || (item.payment?.amount ? `دفعة ${item.payment.amount}` : '') };
    case 'AWAITING_PAYMENT':
      return { label: 'بانتظار الدفع', tone: 'muted', sub: '' };
    case 'REJECTED':
      return { label: 'مرفوضة', tone: 'bad', sub: '' };
    default:
      return { label: '—', tone: 'muted', sub: '' };
  }
}
