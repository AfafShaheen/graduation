import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
  حراسة العدّاد الموحّد لطلبات الدفع بانتظار المراجعة (مهمة B3):
  - المصدر الوحيد: GET /api/admin/stats/v2 → attention.processing (كل الحفلات).
  - ممنوع الرجوع إلى /api/admin/stats القديم في App.jsx.
  - رأس صفحة طلبات الدفع يعرض رقم السياق نفسه (وليس عدد صفوف الحفل).
  - فترة التحديث >= 20 ثانية، مع تنظيف المؤقتات ومستمعات focus/visibility.
*/

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('the helper reads stats/v2 and attention.processing only', async () => {
  const mod = await import('../src/utils/pendingPayments.js');
  assert.equal(mod.readAttentionProcessing({ attention: { processing: 7 } }), 7);
  assert.equal(mod.readAttentionProcessing({}), 0);
  assert.equal(mod.readAttentionProcessing(null), 0);
  assert.equal(mod.readAttentionProcessing({ attention: { processing: '4' } }), 4);
  assert.equal(mod.readAttentionProcessing({ attention: { processing: -2 } }), 0);
});

test('the polling interval is at least 20 seconds', async () => {
  const mod = await import('../src/utils/pendingPayments.js');
  assert.ok(
    mod.PENDING_PAYMENTS_POLL_MS >= 20000,
    `PENDING_PAYMENTS_POLL_MS=${mod.PENDING_PAYMENTS_POLL_MS} must be >= 20000`,
  );
});

test('App.jsx counter uses stats/v2 (via the helper), never the old /api/admin/stats', () => {
  const app = read('App.jsx');
  assert.match(app, /fetchPendingPaymentsTotal/, 'refreshPendingPayments must use the shared helper');
  // لا يُذكر المسار القديم إطلاقاً داخل App.jsx
  assert.doesNotMatch(app, /\/api\/admin\/stats(?!\/v2)/, 'the old /api/admin/stats endpoint must not be used');
  // والمساعد نفسه يستدعي stats/v2 فقط
  const helper = read('utils/pendingPayments.js');
  assert.match(helper, /\/api\/admin\/stats\/v2/);
  assert.doesNotMatch(helper.replace(/\/api\/admin\/stats\/v2/g, ''), /\/api\/admin\/stats/);
});

test('App.jsx polls every 30 s while visible and on focus, with cleanup', () => {
  const app = read('App.jsx');
  assert.match(app, /setInterval\(tick, PENDING_PAYMENTS_POLL_MS\)/);
  assert.match(app, /document\.visibilityState === "visible"/);
  assert.match(app, /addEventListener\("visibilitychange", tick\)/);
  assert.match(app, /addEventListener\("focus", tick\)/);
  assert.match(app, /clearInterval\(timer\)/);
  assert.match(app, /removeEventListener\("visibilitychange", tick\)/);
  assert.match(app, /removeEventListener\("focus", tick\)/);
});

test('the payments page header shows the context total with the كل الحفلات label', () => {
  const page = read('pages/admin/AdminPaymentRequests.jsx');
  assert.match(page, /useAdminStats/, 'the page must read the number from the shared context');
  assert.match(page, /بانتظار التدقيق في كل الحفلات: \{fmt\(pendingPayments\)\}/);
  assert.match(page, /title="[^"]*كل الحفلات[^"]*"/, 'the info title must explain the number');
  // لا عدّاد محلي من صفوف الجدول بعد الآن
  assert.doesNotMatch(page, /pendingCount/, 'the per-ceremony row count must not feed the header');
});

test('the ceremony cards are labelled with the ceremony name', () => {
  const page = read('pages/admin/AdminPaymentRequests.jsx');
  assert.match(page, /قيد التدقيق والمعالجة \(\{ceremonyName\}\)/);
  assert.match(page, /إجمالي الطلبات المستلمة \(\{ceremonyName\}\)/);
  assert.match(page, /حالات عدم تطابق المبلغ \(\{ceremonyName\}\)/);
  assert.match(page, /التذاكر المؤكدة \(\{ceremonyName\}\)/);
});

test('confirm/reject still refresh the shared counter through onPendingChanged', () => {
  const page = read('pages/admin/AdminPaymentRequests.jsx');
  const calls = page.match(/if \(onPendingChanged\) onPendingChanged\(\);/g) || [];
  assert.ok(calls.length >= 2, 'both confirm and reject must call onPendingChanged');
});
