import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EMPTY_AUDIT_FILTERS,
  actionsOfChoice,
  auditQuery,
  dateRangeError,
  dayEnd,
  dayStart,
  hasActiveAuditFilters,
} from '../src/utils/auditFilters.js';
import { namesOf, nameDraftError, tidyName } from '../src/utils/graduateNames.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

const menu = {
  exceptional: ['UPDATE_NAME'],
  groups: [
    { key: 'payments', label: 'الدفع', actions: [{ code: 'PAYMENT_CONFIRMED', label: 'تأكيد دفع' }, { code: 'PAYMENT_REJECTED', label: 'رفض دفع' }] },
    { key: 'entry', label: 'الدخول والمسح', actions: [{ code: 'qr_scanned', label: 'محاولة مسح' }] },
  ],
};

test('the filters become the query the server reads', () => {
  assert.deepEqual(auditQuery(EMPTY_AUDIT_FILTERS, menu, { limit: 50, offset: 0 }), { limit: 50, offset: 0 });

  const q = auditQuery(
    { ...EMPTY_AUDIT_FILTERS, q: '  فاطمة ', choice: 'group:payments', actorType: 'ADMIN', from: '2030-05-01', to: '2030-05-02' },
    menu,
    { limit: 20, offset: 40 },
  );
  assert.deepEqual(q, {
    limit: 20,
    offset: 40,
    q: 'فاطمة',
    action: ['PAYMENT_CONFIRMED', 'PAYMENT_REJECTED'],
    actor_type: 'ADMIN',
    date_from: '2030-05-01T00:00:00+03:00',
    date_to: '2030-05-02T23:59:59+03:00',
  });
});

test('a single action, the exceptional ones and the scans', () => {
  assert.deepEqual(actionsOfChoice('action:PAYMENT_CONFIRMED', menu), ['PAYMENT_CONFIRMED']);
  assert.deepEqual(actionsOfChoice('exceptional', menu), []);
  assert.deepEqual(actionsOfChoice('group:nope', menu), []);
  assert.equal(auditQuery({ choice: 'exceptional' }, menu).exceptional_only, true);
  assert.equal(auditQuery({ scans: true }, menu).include_scans, true);
  // asking for the scan attempts by name shows them without the checkbox
  assert.equal(auditQuery({ choice: 'action:qr_scanned' }, menu).include_scans, true);
  assert.equal(auditQuery({ choice: 'group:payments' }, menu).include_scans, undefined);
});

test('the days are whole days of Damascus', () => {
  assert.equal(dayStart('2030-05-01'), '2030-05-01T00:00:00+03:00');
  assert.equal(dayEnd('2030-05-01'), '2030-05-01T23:59:59+03:00');
  assert.equal(dayStart(''), '');
});

test('what is filtered and what is wrong with the dates', () => {
  assert.equal(hasActiveAuditFilters(EMPTY_AUDIT_FILTERS), false);
  assert.equal(hasActiveAuditFilters({ ...EMPTY_AUDIT_FILTERS, actorType: 'GRADUATE' }), true);
  assert.equal(hasActiveAuditFilters({ ...EMPTY_AUDIT_FILTERS, q: '   ' }), false);
  assert.equal(dateRangeError({ from: '2030-05-02', to: '2030-05-01' }), 'تاريخ البداية بعد تاريخ النهاية.');
  assert.equal(dateRangeError({ from: '2030-05-01', to: '2030-05-01' }), '');
  assert.equal(dateRangeError({ from: '', to: '2030-05-01' }), '');
});

test('the list of actions is sent as repeated keys', () => {
  const api = read('api/admin.js');
  assert.match(api, /Array\.isArray\(value\)/);
  assert.match(api, /value\.forEach\(\(item\) => searchParams\.append\(key, item\)\)/);
});

test('the audit tab has the filters and names the graduates who acted', () => {
  const tab = read('pages/admin/roster/AuditTab.jsx');
  for (const piece of ['نوع الإجراء', 'المنفِّذ', 'من تاريخ', 'إلى تاريخ', 'محاولات المسح', 'مسح الكل', 'الاستثنائية فقط']) {
    assert.ok(tab.includes(piece), piece);
  }
  assert.ok(tab.includes('setTimeout') && tab.includes('400'), 'the search waits until he stops typing');
  assert.ok(!tab.includes('exceptionalOnly: true'), 'the tab no longer shows only the exceptional actions');
  const util = read('utils/auditFilters.js');
  assert.ok(['ADMIN', 'GRADUATE', 'SCANNER'].every((a) => util.includes(`'${a}'`)));
});

test('names: tidy, prefill and validate', () => {
  assert.equal(tidyName('  فَاطِمَة   الزهراء '), 'فاطمة الزهراء');
  assert.equal(tidyName('محـمد'), 'محمد');
  assert.deepEqual(namesOf({ first_name: 'فاطمة', last_name: 'أحمد', father_name: 'علي', mother_name: 'منى' }, {}), {
    firstName: 'فاطمة', lastName: 'أحمد', fatherName: 'علي', motherName: 'منى',
  });
  // an account without split names: the full name is split in two
  assert.deepEqual(namesOf(null, { full_name: 'محمد عبد الله' }), { firstName: 'محمد', lastName: 'عبد الله', fatherName: '', motherName: '' });

  const ok = { firstName: 'فاطمة', lastName: 'الأحمد', fatherName: 'عبد الله', motherName: 'خديجة' };
  assert.equal(nameDraftError(ok), '');
  assert.equal(nameDraftError({ ...ok, firstName: 'Fatima' }), 'الاسم: حروف عربية ومسافات فقط، وحرفان على الأقل.');
  assert.match(nameDraftError({ ...ok, motherName: 'م' }), /^اسم الأم/);
  assert.match(nameDraftError({ ...ok, lastName: '' }), /^الكنية/);
  assert.equal(nameDraftError({ ...ok, firstName: 'فَاطِمَة' }), '', 'diacritics are tidied, not refused');
});

test('the drawer has the name edit next to the e-mail edit', () => {
  const drawer = read('pages/admin/roster/RosterDrawer.jsx');
  assert.ok(drawer.includes('تعديل الاسم') && drawer.includes('حفظ الاسم'));
  assert.ok(drawer.includes('updateGraduateName(graduateId, nameDraft)'));
  assert.ok(drawer.includes('nameDraftError(nameDraft)'));
  assert.match(read('pages/admin/hooks/useAdminGraduates.js'), /\/api\/admin\/graduates\/\$\{id\}\/name/);
});
