import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// SSR rendering of the roster drawer for the verify-email action (task B2.2),
// plus a static check that every ACTIONS key exists in the API contract
// schema RosterActions (back/tests/contract/openapi_baseline.json).

let server;
let RosterDrawer;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  RosterDrawer = (await server.ssrLoadModule('/src/pages/admin/roster/RosterDrawer.jsx')).default;
});
after(async () => {
  await server.close();
});

// Obviously fake data only (S8). The shape follows RosterItem in
// back/app/schemas/roster.py (flat fields + nested registration/payment/entry).
const baseRow = (actions, registration = {}) => ({
  record_id: 1,
  event_id: 2,
  event_name: 'حفل تجربة',
  university_id: 'FAKE-0001',
  full_name: 'شخص تجربة',
  father_name: 'أب تجربة',
  mother_name: 'أم تجربة',
  gender: 'ذكر',
  college_id: 3,
  college_name: 'كلية التجربة',
  major_name: 'تخصص تجربة',
  gpa: '3.50',
  top_rank: null,
  is_top: false,
  registration: {
    state: 'verified',
    graduate_id: 7,
    email: 'fake@example.test',
    email_verified: true,
    ...registration,
  },
  ticket: { id: 11, status: 'CONFIRMED', companions_count: 2, type: 'two', price: '10000', seat: 'A1' },
  payment: { state: 'confirmed', amount: '10000', submitted_at: null, mismatch: false },
  entry: { entered: false, at: null, manual: false },
  actions,
  stale: false,
});

const render = (row) =>
  renderToStaticMarkup(
    React.createElement(RosterDrawer, {
      row,
      stale: false,
      onClose: () => {},
      onChanged: async () => {},
      onNotice: () => {},
    })
  );

const VERIFY_LABEL = 'تأكيد الإيميل';

test('unconfirmed account: the verify-email button is enabled', () => {
  const html = render(
    baseRow({ manual_entry: false, cancel_scan: false, revert_payment: false, verify_email: true })
  );
  assert.ok(html.includes(VERIFY_LABEL), 'the action label is missing');
  // The button element containing the label must not carry `disabled`.
  const idx = html.indexOf(VERIFY_LABEL);
  const btnStart = html.lastIndexOf('<button', idx);
  const btnTag = html.slice(btnStart, html.indexOf('>', btnStart));
  assert.ok(!btnTag.includes('disabled'), `button should be enabled: ${btnTag}`);
});

test('confirmed account: the verify-email button is disabled with the hint', () => {
  const html = render(
    baseRow({ manual_entry: false, cancel_scan: false, revert_payment: false, verify_email: false })
  );
  const idx = html.indexOf(VERIFY_LABEL);
  assert.ok(idx >= 0, 'the action must still be listed (disabled), not hidden');
  const btnStart = html.lastIndexOf('<button', idx);
  const upToLabel = html.slice(btnStart, idx + VERIFY_LABEL.length);
  assert.ok(upToLabel.includes('disabled'), 'button should be disabled');
  assert.ok(html.includes('متاح فقط لحساب لم يؤكد بريده بعد.'), 'blocked hint missing');
});

test('not registered: no exceptional action buttons at all', () => {
  const html = render(
    baseRow(
      { manual_entry: false, cancel_scan: false, revert_payment: false, verify_email: false },
      { state: 'not_registered', graduate_id: null, email: null }
    )
  );
  for (const label of [VERIFY_LABEL, 'تسجيل دخول يدوي', 'إلغاء المسح', 'إرجاع الدفع لقيد المعالجة']) {
    assert.ok(!html.includes(label), `unexpected action button: ${label}`);
  }
});

test('every ACTIONS key exists in RosterActions of the OpenAPI baseline', () => {
  const src = fs.readFileSync(
    fileURLToPath(new URL('../src/pages/admin/roster/RosterDrawer.jsx', import.meta.url)),
    'utf-8'
  );
  const keys = [...src.matchAll(/^\s{4}key: '([a-z_]+)',/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 4, `expected at least 4 action keys, found: ${keys.join(',')}`);
  const baseline = JSON.parse(
    fs.readFileSync(
      fileURLToPath(new URL('../../back/tests/contract/openapi_baseline.json', import.meta.url)),
      'utf-8'
    )
  );
  const props = baseline.components.schemas.RosterActions.properties;
  for (const k of keys) {
    assert.ok(k in props, `ACTIONS key "${k}" is not in RosterActions of the contract`);
  }
  assert.ok(keys.includes('verify_email'), 'verify_email action must exist in the drawer');
});
