import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('the dashboard page uses the new statistics only', () => {
  const page = read('pages/admin/AdminDashboard.jsx');
  assert.match(page, /useAdminStatsV2/);
  assert.match(page, /StatsView/);
  assert.doesNotMatch(page, /useAdminStats\.js|fetchRecentPayments|useAdminVolunteers|PAY_STATUS_UI/);
  assert.doesNotMatch(page, /سجل التدقيق للخريجين|48 ساعة|تحديث مباشر/);
});

test('the filter at the top applies to the whole page', () => {
  const page = read('pages/admin/AdminDashboard.jsx');
  assert.match(page, /useAdminStatsV2\(eventId \|\| null\)/);
  assert.match(page, /ready = Boolean\(data\) && String\(data\.scope\.event_id/);
  assert.match(page, /كل الحفلات/);
  assert.match(page, /الفلتر يشمل كل ما في الصفحة/);
});

test('the numbers refresh by themselves without pressing on the server', () => {
  const hook = read('pages/admin/hooks/useAdminStatsV2.js');
  assert.match(hook, /document\.visibilityState === 'visible'/);
  assert.match(hook, /visibilitychange/);
  const poll = Number(/STATS_POLL_MS = (\d+)/.exec(hook)[1]);
  const eventDay = Number(/STATS_POLL_EVENT_DAY_MS = (\d+)/.exec(hook)[1]);
  assert.ok(poll >= 20000, 'the normal refresh must not be faster than every 20 s');
  assert.ok(eventDay >= 10000, 'even on the ceremony day not faster than every 10 s');
});

test('the page only uses the colours of the app', () => {
  const dashboard = fs.readFileSync(new URL('../src/style/AdminDashboard.css', import.meta.url), 'utf-8');
  const stats = fs.readFileSync(new URL('../src/style/AdminStats.css', import.meta.url), 'utf-8');
  const hexes = (css) => new Set((css.match(/#[0-9a-fA-F]{3,6}\b/g) || []).map((h) => h.toLowerCase()));
  // soft tints and two intermediate greens (funnel) of the app's own red, orange and green
  const tints = new Set(['#fff1e6', '#fdecea', '#e8f5f1', '#fbe6d4', '#e1f0ea', '#8a3200', '#2f7a63', '#5fa08a']);
  const allowed = new Set([...hexes(dashboard), ...tints, '#fff']);
  const foreign = [...hexes(stats)].filter((h) => !allowed.has(h));
  assert.deepEqual(foreign, [], `colours that are not in the app: ${foreign.join(', ')}`);
  const view = read('pages/admin/stats/StatsView.jsx') + read('utils/stats.js');
  const inJs = [...hexes(view)].filter((h) => !allowed.has(h));
  assert.deepEqual(inJs, [], `colours in the JS that are not in the app: ${inJs.join(', ')}`);
});

test('no button is nested inside another button', () => {
  const view = read('pages/admin/stats/StatsView.jsx');
  assert.doesNotMatch(view, /<button[^>]*>[^<]*<InfoTip/);
});
