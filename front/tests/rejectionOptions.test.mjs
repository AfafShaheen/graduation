import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// JSX is loaded through Vite's SSR pipeline (same pattern as clientServerErrors.test.mjs).
let server;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
});
after(async () => {
  await server.close();
});

const PHONE = '+963933123456'; // obviously fake test number (S9)

async function render(props) {
  const mod = await server.ssrLoadModule('/src/components/RejectionOptions.jsx');
  return renderToStaticMarkup(React.createElement(mod.default, props));
}

test('RejectionOptions: registration open + phone -> both buttons, correct tel href', async () => {
  const html = await render({ registrationOpen: true, phone: PHONE, onResubmit: () => {} });
  assert.match(html, /ماذا تريد أن تفعل\؟/);
  assert.match(html, /إعادة الدفع/);
  assert.match(html, /تواصل مع الدعم/);
  assert.match(html, new RegExp(`href="tel:${escapeRe(PHONE)}"`));
  assert.match(html, /dir="ltr"/); // the number itself is rendered LTR
  // closed sentence and office text must NOT appear
  assert.doesNotMatch(html, /انتهت فترة التسجيل/);
  assert.doesNotMatch(html, /تواصل مع مكتب الاتحاد/);
});

test('RejectionOptions: registration open + no phone -> resubmit button + office text, no tel link', async () => {
  const html = await render({ registrationOpen: true, phone: '', onResubmit: () => {} });
  assert.match(html, /إعادة الدفع/);
  assert.match(html, /تواصل مع مكتب الاتحاد\./);
  assert.doesNotMatch(html, /href="tel:/);
  assert.doesNotMatch(html, /انتهت فترة التسجيل/);
});

test('RejectionOptions: registration closed + phone -> support only + closed sentence, no resubmit', async () => {
  const html = await render({ registrationOpen: false, phone: '0933123456', onResubmit: () => {} });
  // the resubmit BUTTON is gone (the word also appears inside the closed sentence, so check markup)
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /تواصل مع الدعم/);
  assert.match(html, /href="tel:0933123456"/);
  assert.match(html, /انتهت فترة التسجيل، لم يعد إعادة الدفع متاحاً\./);
  assert.doesNotMatch(html, /تواصل مع مكتب الاتحاد/);
});

test('RejectionOptions: registration closed + no phone -> office text + closed sentence only', async () => {
  const html = await render({ registrationOpen: false, phone: null, onResubmit: () => {} });
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /href="tel:/);
  assert.match(html, /تواصل مع مكتب الاتحاد\./);
  assert.match(html, /انتهت فترة التسجيل، لم يعد إعادة الدفع متاحاً\./);
});

test('OrderRejected.jsx static checks: D6 wording in, old claims out, wiring kept', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../src/pages/student/OrderRejected.jsx', import.meta.url)),
    'utf8',
  );
  // the two old fixed claims are gone
  assert.ok(!src.includes('مطابقة الإشعار'), 'old claim about notification matching must be removed');
  assert.ok(!src.includes('رقم العملية المكتوب في إشعار'), 'old hint about retyping the transaction number must be removed');
  // new D6 wording present
  assert.ok(src.includes('تم رفض طلب الدفع'));
  assert.ok(src.includes('راجعنا طلبك ولم نتمكن من تأكيد الدفع'));
  // helpers wired
  assert.ok(src.includes('RejectionOptions'), 'page must use RejectionOptions');
  assert.ok(src.includes('rejectionReasonText'), 'page must use rejectionReasonText');
  // HelpFooter imported exactly once and rendered exactly once (graduate pages rule)
  assert.equal((src.match(/from '.*HelpFooter'/g) || []).length, 1);
  assert.equal((src.match(/<HelpFooter/g) || []).length, 1);
  // kept features
  assert.ok(src.includes('or-retry-link'), 'reload button must stay');
  assert.ok(src.includes('CEREMONY_TITLE'), 'footer brand string must stay');
});

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
