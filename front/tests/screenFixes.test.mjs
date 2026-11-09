import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('the "payment submitted" page has no empty bar with a bell', () => {
  assert.ok(!read('pages/student/OrderStatus.jsx').includes('notifications_active'));
  assert.ok(!read('pages/student/OrderStatus.jsx').includes('os-reassurance'));
  assert.ok(!read('style/OrderStatus.css').includes('os-reassurance'));
});

test('on the rejected page the options come after the reason, in the page, never fixed over it', () => {
  const css = read('style/OrderRejected.css');
  const dock = css.slice(css.indexOf('.or-bottom-dock {'));
  const rule = dock.slice(0, dock.indexOf('}'));
  assert.match(rule, /position: static/);
  assert.doesNotMatch(rule, /sticky|fixed/);
  const page = read('pages/student/OrderRejected.jsx');
  assert.ok(page.indexOf('or-reason-desc') < page.indexOf('<RejectionOptions'), 'the reason is above the options');
});

test('the admin scanners table lists every ceremony unless a filter is chosen, apart from the creation form', () => {
  const page = read('pages/admin/AdminScannersSettings.jsx');
  assert.ok(page.includes("const [listEventId, setListEventId] = useState('')"));
  assert.ok(page.includes('useAdminScanners(listEventId || null)'));
  assert.ok(!page.includes('useAdminScanners(scannerEventId'), 'the creation form no longer narrows the table');
  assert.ok(page.includes('<option value="">كل الحفلات</option>'));
});
