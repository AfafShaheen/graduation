import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  QUICK_STATUSES, activeQuick, applyQuick, activeExtras, EXTRA_FILTERS,
  ROSTER_COLUMNS, DEFAULT_COLUMNS, sanitizeColumns, toggleColumn, loadColumns, saveColumns, statusSummary,
} from '../src/utils/rosterView.js';
import { EMPTY_FILTERS, buildRosterFilterQuery, REGISTRATION_OPTIONS, TICKET_OPTIONS } from '../src/utils/roster.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');
const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v) };
};

test('every quick chip sets values the API accepts', () => {
  for (const q of QUICK_STATUSES) {
    if (q.set.registration) assert.ok(REGISTRATION_OPTIONS.some((o) => o.value === q.set.registration), q.key);
    if (q.set.ticket) assert.ok(TICKET_OPTIONS.some((o) => o.value === q.set.ticket), q.key);
  }
});

test('a chip is active exactly when the filters equal it, and clicking one replaces the previous', () => {
  assert.equal(activeQuick(EMPTY_FILTERS), 'all');
  const confirmed = applyQuick(EMPTY_FILTERS, 'confirmed');
  assert.deepEqual(buildRosterFilterQuery(confirmed), { registration: 'verified', ticket: 'confirmed' });
  assert.equal(activeQuick(confirmed), 'confirmed');
  const rejected = applyQuick({ ...confirmed, collegeId: '3' }, 'rejected');
  assert.equal(rejected.collegeId, '3', 'the other filters are kept');
  assert.equal(rejected.ticket, 'rejected');
  assert.equal(activeQuick(applyQuick(rejected, 'all')), 'all');
  assert.equal(activeQuick({ ...EMPTY_FILTERS, registration: 'verified' }), null, 'not a chip: the extra list shows it');
});

test('extra filters are counted, and registration/ticket only when they are not a chip', () => {
  assert.deepEqual(activeExtras(EMPTY_FILTERS), []);
  assert.deepEqual(activeExtras(applyQuick(EMPTY_FILTERS, 'confirmed')), []);
  const tags = activeExtras({ ...applyQuick(EMPTY_FILTERS, 'confirmed'), topRank: 'any', entry: 'entered' });
  assert.deepEqual(tags.map((t) => t.key), ['topRank', 'entry']);
  assert.match(tags[0].label, /الأوائل/);
  assert.deepEqual(activeExtras({ ...EMPTY_FILTERS, registration: 'verified' }).map((t) => t.key), ['registration']);
  // nothing was dropped: every one of the nine filters is still reachable
  const reachable = new Set(['search', 'eventId', 'collegeId', ...EXTRA_FILTERS.map((f) => f.key)]);
  assert.deepEqual([...reachable].sort(), Object.keys(EMPTY_FILTERS).sort());
});

test('columns: the name is fixed, order is the table order, junk is ignored', () => {
  assert.deepEqual(DEFAULT_COLUMNS, ['name', 'college', 'status', 'entry']);
  assert.deepEqual(sanitizeColumns(['entry', 'payment', 'bogus']), ['name', 'payment', 'entry']);
  assert.deepEqual(sanitizeColumns(undefined), DEFAULT_COLUMNS);
  assert.deepEqual(sanitizeColumns(['name']), DEFAULT_COLUMNS, 'a table with only the name falls back');
  assert.deepEqual(toggleColumn(DEFAULT_COLUMNS, 'payment'), ['name', 'college', 'status', 'payment', 'entry']);
  assert.deepEqual(toggleColumn(DEFAULT_COLUMNS, 'name'), DEFAULT_COLUMNS, 'the name cannot be hidden');
  assert.ok(ROSTER_COLUMNS.length === 8);
});

test('the chosen columns are kept in the browser and a broken storage is harmless', () => {
  const store = memory();
  assert.deepEqual(loadColumns(store), DEFAULT_COLUMNS);
  saveColumns(['name', 'ticket', 'entry'], store);
  assert.deepEqual(loadColumns(store), ['name', 'ticket', 'entry']);
  store.setItem('admin.roster.columns', '{broken');
  assert.deepEqual(loadColumns(store), DEFAULT_COLUMNS);
  const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.deepEqual(loadColumns(blocked), DEFAULT_COLUMNS);
  assert.doesNotThrow(() => saveColumns(['name'], blocked));
});

test('one status per person, the most useful first', () => {
  const base = { registration: { state: 'verified' }, payment: { state: 'none' }, ticket: null };
  assert.equal(statusSummary({ registration: { state: 'not_registered' } }).label, 'لم يسجّل بعد');
  assert.equal(statusSummary({ registration: { state: 'unverified' } }).label, 'بانتظار تأكيد البريد');
  assert.equal(statusSummary(base).label, 'بدون تذكرة');
  const processing = statusSummary({ ...base, ticket: { status: 'PROCESSING' }, payment: { state: 'pending', amount: '50.00' } });
  assert.deepEqual([processing.label, processing.tone, processing.sub], ['بانتظار مراجعتك', 'warn', 'دفعة 50.00']);
  assert.equal(statusSummary({ ...base, ticket: { status: 'PROCESSING' }, payment: { state: 'pending', mismatch: true } }).sub, 'المبلغ غير مطابق');
  assert.equal(statusSummary({ ...base, ticket: { status: 'CONFIRMED' } }).tone, 'ok');
  assert.equal(statusSummary({ ...base, ticket: { status: 'REJECTED' } }).tone, 'bad');
  assert.equal(statusSummary({ ...base, ticket: { status: 'AWAITING_PAYMENT' } }).label, 'بانتظار الدفع');
});

test('the roster pages use them', () => {
  assert.match(read('pages/admin/roster/RosterFilters.jsx'), /QUICK_STATUSES/);
  assert.match(read('pages/admin/roster/RosterFilters.jsx'), /فلاتر إضافية/);
  assert.match(read('pages/admin/roster/RosterTab.jsx'), /<ColumnChooser/);
  assert.match(read('pages/admin/roster/RosterTab.jsx'), /columns=\{columns\}/);
  assert.match(read('pages/admin/roster/ColumnChooser.jsx'), /تخصيص الأعمدة/);
});

test('the roster page text is in standard Arabic', () => {
  const page = read('pages/admin/AdminExceptions.jsx');
  assert.ok(!page.includes('شوف مين') && !page.includes('بيتسجل'));
});
