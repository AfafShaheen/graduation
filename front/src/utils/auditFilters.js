// The filters of the audit log and the query they become. Pure, so it can be tested.

export const EMPTY_AUDIT_FILTERS = {
  q: '',
  choice: 'all', // all | exceptional | group:<key> | action:<CODE>
  actorType: '',
  from: '', // YYYY-MM-DD (a day in Damascus)
  to: '',
  scans: false,
};

export const ACTOR_OPTIONS = [
  { value: 'ADMIN', label: 'مسؤول الاتحاد' },
  { value: 'GRADUATE', label: 'خريج' },
  { value: 'SCANNER', label: 'ماسح' },
];

// "group:payments" -> ['PAYMENT_SUBMITTED', ...] using the menu the server sent
export function actionsOfChoice(choice, menu) {
  if (!choice || choice === 'all' || choice === 'exceptional') return [];
  if (choice.startsWith('action:')) return [choice.slice('action:'.length)];
  if (choice.startsWith('group:')) {
    const group = (menu?.groups || []).find((g) => g.key === choice.slice('group:'.length));
    return group ? group.actions.map((a) => a.code) : [];
  }
  return [];
}

// the whole day of Damascus (UTC+3 all year)
export const dayStart = (day) => (day ? `${day}T00:00:00+03:00` : '');
export const dayEnd = (day) => (day ? `${day}T23:59:59+03:00` : '');

export function auditQuery(filters, menu, { limit = 50, offset = 0 } = {}) {
  const f = { ...EMPTY_AUDIT_FILTERS, ...filters };
  const query = { limit, offset };
  const q = f.q.trim();
  if (q) query.q = q;
  if (f.choice === 'exceptional') query.exceptional_only = true;
  const actions = actionsOfChoice(f.choice, menu);
  if (actions.length) query.action = actions;
  // a scan attempt is an action of its own: asking for it by name must show it
  if (f.scans || actions.includes('qr_scanned')) query.include_scans = true;
  if (f.actorType) query.actor_type = f.actorType;
  if (f.from) query.date_from = dayStart(f.from);
  if (f.to) query.date_to = dayEnd(f.to);
  return query;
}

export function hasActiveAuditFilters(filters) {
  const f = { ...EMPTY_AUDIT_FILTERS, ...filters };
  return Boolean(f.q.trim() || f.choice !== 'all' || f.actorType || f.from || f.to || f.scans);
}

// a "from" after the "to" can never match: say it instead of showing an empty list
export function dateRangeError(filters) {
  const { from, to } = { ...EMPTY_AUDIT_FILTERS, ...filters };
  return from && to && from > to ? 'تاريخ البداية بعد تاريخ النهاية.' : '';
}
