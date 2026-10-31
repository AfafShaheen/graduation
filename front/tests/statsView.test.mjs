import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fmt, money } from '../src/utils/stats.js';

// The view is rendered with REAL answers of the statistics API (saved by the backend tests).
const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'));
const single = load('stats-v2-event.json');
const all = load('stats-v2-all.json');

let server;
let StatsView;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  StatsView = (await server.ssrLoadModule('/src/pages/admin/stats/StatsView.jsx')).default;
});
after(async () => {
  await server.close();
});

const render = (data) => renderToStaticMarkup(React.createElement(StatsView, { data, onGo: () => {} }));
const count = (html, text) => html.split(text).length - 1;

test('one ceremony: every section is there and says what it counts', () => {
  const html = render(single);
  for (const title of ['الدخول (الحفل المحدد)', 'حالة الخريجين المسجلين', 'الحضور المتوقع', 'المالية (مؤكدة)', 'الأوائل', 'تمثيل الدفعة', 'حسب الكلية', 'الحسابات المؤكدة', 'إغلاق التسجيل', 'متوسط وقت المراجعة']) {
    assert.ok(html.includes(title), `missing: ${title}`);
  }
  assert.ok(!html.includes('الأرقام هنا مجموع كل الحفلات'), 'the all-ceremonies note belongs to the all view only');
});

test('the strip sits under the status card, the entry card is above, and the old title is gone', () => {
  const html = render(single);
  assert.ok(!html.includes('مطلوب منك الآن'));
  const at = (label) => html.indexOf(`aria-label="${label}"`);
  const [entry, status, strip, attendance] = ['الدخول', 'حالة الخريجين المسجلين', 'أرقام تحتاج متابعة', 'الحضور المتوقع'].map(at);
  assert.ok([entry, status, strip, attendance].every((i) => i >= 0), 'a section is missing');
  assert.ok(entry < status && status < strip && strip < attendance, 'wrong order of the sections');
});

test('the strip shows the four numbers of the data', () => {
  const html = render(single);
  const a = single.attention;
  assert.ok(html.includes(`<b>${fmt(a.processing)}</b> طلب دفع بانتظار المراجعة`));
  assert.ok(html.includes(`<b>${fmt(a.rejected)}</b> مرفوضة`));
  assert.ok(html.includes(`<b>${fmt(a.unverified)}</b> بانتظار تأكيد البريد`));
  assert.ok(html.includes(`<b>${fmt(a.confirmed)}</b> طلب تم تأكيده`));
  assert.ok(html.includes('أقدمها منذ'));
});

test('attendance, entry and money show the numbers of the data', () => {
  const html = render(single);
  assert.ok(html.includes('الحضور المتوقع'));
  assert.ok(html.includes(`>${fmt(single.attendance.expected)}</button>`));
  assert.ok(html.includes(`${fmt(single.attendance.graduates)} من الخريجين`));
  assert.ok(html.includes(`${fmt(single.attendance.companions)} مرافقاً`));
  assert.ok(html.includes(`دخلوا من أصل ${fmt(single.entry.expected)}`));
  assert.ok(html.includes(money(single.finance.confirmed_amount)));
  assert.ok(html.includes(`قيد المراجعة ${money(single.finance.processing_amount)}`));
  assert.ok(html.includes(`من ${fmt(single.representation.answered)} أجابوا`));
  assert.ok(html.includes(`من ${fmt(single.top_students.total)} سجّلوا`));
});

test('colleges: each one once, the percentage is confirmed over expected', () => {
  const html = render(all);
  for (const c of all.colleges) {
    assert.equal(count(html, `>${c.name}</button>`), 1, `${c.name} must appear once`);
    const rate = c.expected > 0 ? Math.round((c.confirmed / c.expected) * 100) : 0;
    assert.ok(html.includes(`<span>${rate}%</span>`), `${c.name}: rate ${rate}%`);
    assert.ok(
      html.includes(`<td>${fmt(c.expected)}</td><td>${fmt(c.registered)}</td><td>${fmt(c.confirmed)}</td>`),
      `${c.name}: expected, registered and confirmed must be in their own columns`,
    );
  }
});

test('all ceremonies: the note explains the numbers and each ceremony has its own bar and entry row', () => {
  const html = render(all);
  assert.ok(html.includes('الخريج المسجّل بحفلين يُحسب مرة واحدة'));
  assert.ok(html.includes('الدخول (كل الحفلات)'));
  assert.ok(html.includes('أشخاص مختلفون'));
  assert.ok(html.includes('الخريج بحفلين = حضوران'));
  for (const e of all.by_event) {
    assert.ok(count(html, e.event_name) >= 2, `${e.event_name}: status block and entry row`);
  }
  assert.ok(html.includes('أقرب إغلاق للتسجيل'));
});

test('the false sentences and the old cards are gone', () => {
  const html = render(single) + render(all);
  for (const gone of ['48 ساعة', 'تم إشعار المرفوضين', 'فئات التذاكر المحجوزة', 'نسبة الاستجابة', 'يرغبون بتولّي مسؤولية', 'سجل التدقيق للخريجين']) {
    assert.ok(!html.includes(gone), `still there: ${gone}`);
  }
});

test('every number has a definition tip', () => {
  const html = render(single);
  assert.ok(count(html, 'role="tooltip"') >= 12);
  assert.ok(html.includes('مجموع الشريط = عدد المسجلين'));
});

test('an empty system renders without errors and without invented numbers', () => {
  const empty = {
    ...single,
    by_event: [],
    colleges: [],
    status: { confirmed: 0, processing: 0, awaiting_payment: 0, rejected: 0, no_ticket: 0 },
    attention: { processing: 0, oldest_pending_hours: null, rejected: 0, unverified: 0, confirmed: 0 },
    attendance: { graduates: 0, companions: 0, expected: 0 },
    entry: { entered: 0, graduates_entered: 0, companions_entered: 0, manual: 0, expected: 0, last_entry_at: null },
    finance: { confirmed_amount: '0.00', processing_amount: '0.00', by_package: [] },
    footer: { confirmed_accounts: 0, registration: null, avg_review_hours: null, reviewed_count: 0 },
  };
  const html = render(empty);
  assert.ok(html.includes('لا توجد بيانات بعد.'));
  assert.ok(html.includes('لا توجد بيانات كليات لعرضها.'));
  assert.ok(html.includes('لم يبدأ المسح بعد'));
  assert.ok(html.includes('لا يوجد تسجيل مفتوح'));
  assert.ok(html.includes('—'));
  assert.ok(!html.includes('NaN') && !html.includes('undefined') && !html.includes('Infinity'));
});

test('a manual entry is shown only when there is one', () => {
  const withManual = { ...single, entry: { ...single.entry, entered: 2, manual: 1 } };
  assert.ok(render(withManual).includes('منهم دخول يدوي 1'));
  assert.ok(!render({ ...single, entry: { ...single.entry, manual: 0 } }).includes('دخول يدوي'));
});
