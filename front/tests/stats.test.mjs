import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  fmt, pct, funnelSteps, sparkline, statusSegments, statusTotal, ageLabel, closeIn, collegeRate, rateTone,
  sortColleges, drillSection, drillFilters, STATUS_SEGMENTS,
} from '../src/utils/stats.js';
import { filtersFromSearch } from '../src/utils/roster.js';

test('numbers are written with thousands separators and percentages never divide by zero', () => {
  assert.equal(fmt(13500000), '13,500,000');
  assert.equal(fmt(null), '0');
  assert.equal(pct(1, 3), 33);
  assert.equal(pct(2, 3), 67);
  assert.equal(pct(5, 0), 0);
});

test('the five states add up to the total and the shares add up to 100', () => {
  const status = { confirmed: 270, processing: 12, awaiting_payment: 38, rejected: 3, no_ticket: 87 };
  const segments = statusSegments(status);
  assert.deepEqual(segments.map((s) => s.key), STATUS_SEGMENTS.map((s) => s.key));
  assert.equal(statusTotal(status), 410);
  assert.ok(Math.abs(segments.reduce((sum, s) => sum + s.share, 0) - 100) < 1e-9);
  assert.equal(statusTotal({}), 0);
  assert.ok(statusSegments({}).every((s) => s.share === 0));
});

test('the age of the oldest pending request reads naturally', () => {
  assert.equal(ageLabel(null), '');
  assert.equal(ageLabel(0.4), 'أقل من ساعة');
  assert.equal(ageLabel(1.2), 'ساعة');
  assert.equal(ageLabel(2.9), 'ساعتين');
  assert.equal(ageLabel(5), '5 ساعات');
  assert.equal(ageLabel(13), '13 ساعة');
  assert.equal(ageLabel(72), '3 أيام');
});

test('the time left to registration uses the server clock', () => {
  const now = '2026-11-01T10:00:00+00:00';
  assert.deepEqual(closeIn(null, now), { closed: true, value: '', unit: '' });
  assert.equal(closeIn({ ends_at: '2026-10-30T10:00:00+00:00' }, now).closed, true);
  assert.deepEqual(closeIn({ ends_at: '2026-11-07T10:00:00+00:00' }, now), { closed: false, value: 6, unit: 'أيام' });
  assert.deepEqual(closeIn({ ends_at: '2026-11-02T10:00:00+00:00' }, now), { closed: false, value: 1, unit: 'يوم' });
  assert.deepEqual(closeIn({ ends_at: '2026-11-01T13:00:00+00:00' }, now), { closed: false, value: 3, unit: 'ساعات' });
});

test('college rate is confirmed over expected, with the colour family of the bar', () => {
  assert.equal(collegeRate({ confirmed: 80, expected: 120 }), 67);
  assert.equal(collegeRate({ confirmed: 0, expected: 0 }), 0);
  assert.equal(rateTone(67), 'good');
  assert.equal(rateTone(44), 'mid');
  assert.equal(rateTone(27), 'low');
});

test('colleges sort by rate or by name', () => {
  const list = [
    { name: 'ب', confirmed: 50, expected: 100 },
    { name: 'أ', confirmed: 10, expected: 100 },
    { name: 'ج', confirmed: 90, expected: 100 },
  ];
  assert.deepEqual(sortColleges(list, 'lowest').map((c) => c.name), ['أ', 'ب', 'ج']);
  assert.deepEqual(sortColleges(list, 'highest').map((c) => c.name), ['ج', 'ب', 'أ']);
  assert.deepEqual(sortColleges(list, 'name').map((c) => c.name), ['أ', 'ب', 'ج']);
  assert.equal(list[0].name, 'ب'); // the input is not changed
});

test('every number opens the graduates page with the filter that lists its people', () => {
  assert.equal(drillSection(drillFilters('confirmed', 3)), 'actions?event_id=3&registration=verified&ticket=confirmed');
  assert.equal(drillSection(drillFilters('no_ticket', null)), 'actions?registration=verified&ticket=none');
  assert.equal(drillSection(drillFilters('unverified', 7)), 'actions?event_id=7&registration=unverified');
  assert.equal(
    drillSection(drillFilters('entered', 2)),
    'actions?event_id=2&registration=verified&ticket=confirmed&entry=entered',
  );
  assert.equal(drillSection({ college_id: 5 }), 'actions?college_id=5');
  assert.equal(drillSection({}), 'actions');
});

test('the graduates page understands every link the statistics page builds', () => {
  const kinds = ['processing', 'rejected', 'unverified', 'confirmed', 'awaiting_payment', 'no_ticket', 'registered', 'entered', 'top'];
  kinds.forEach((kind) => {
    const section = drillSection(drillFilters(kind, 4));
    const query = section.split('?')[1];
    const parsed = filtersFromSearch(`?${query}`);
    const sent = [...new URLSearchParams(query).keys()];
    assert.equal(Object.keys(parsed).length, sent.length, `the roster ignored a part of the "${kind}" link`);
    assert.equal(parsed.eventId, '4');
  });
});

test('links only use parameters and values of the roster API contract', { skip: !fs.existsSync(new URL('../../back/tests/contract/openapi_baseline.json', import.meta.url)) }, () => {
  const spec = JSON.parse(fs.readFileSync(new URL('../../back/tests/contract/openapi_baseline.json', import.meta.url), 'utf-8'));
  const params = Object.fromEntries(spec.paths['/api/admin/roster'].get.parameters.map((p) => [p.name, p]));
  const allowed = (p) => (p.schema.anyOf || [p.schema]).flatMap((v) => v.enum || []);
  ['processing', 'rejected', 'unverified', 'confirmed', 'awaiting_payment', 'no_ticket', 'registered', 'entered', 'top'].forEach((kind) => {
    Object.entries(drillFilters(kind, 1)).forEach(([name, value]) => {
      assert.ok(params[name], `the roster API has no parameter "${name}"`);
      const values = allowed(params[name]);
      if (values.length) assert.ok(values.includes(value), `"${name}=${value}" is not accepted by the API`);
    });
  });
});

test('funnel steps are shares of the first step', () => {
  const steps = funnelSteps({ accounts: 10, verified: 8, paid: 5, confirmed: 2 });
  assert.deepEqual(steps.map((x) => x.share), [100, 80, 50, 20]);
  assert.deepEqual(funnelSteps({}).map((x) => x.share), [0, 0, 0, 0]);
});

test('sparkline stays inside its box and finds the peak', () => {
  const days = [{ date: '2026-11-01', count: 1 }, { date: '2026-11-02', count: 4 }, { date: '2026-11-03', count: 2 }];
  const sp = sparkline(days, 260, 80, 6);
  assert.equal(sp.total, 7);
  assert.equal(sp.peak.date, '2026-11-02');
  assert.ok(sp.line.startsWith('M0 '));
  assert.ok(sp.last[0] === 260 && sp.last[1] >= 0 && sp.last[1] <= 80);
  assert.equal(sparkline([]).line, '');
});
