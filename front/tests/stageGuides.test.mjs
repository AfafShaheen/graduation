import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stageForPath, pathForStage, guidePath, GUIDE_STAGES } from '../src/utils/stage.js';
import { ackGuide, hasAckedGuide, pendingGuideFor, ackKey } from '../src/utils/guideAck.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v), data };
};

test('each page after registration belongs to one stage and back', () => {
  assert.deepEqual(GUIDE_STAGES, ['package', 'payment', 'submitted', 'ticket']);
  for (const stage of GUIDE_STAGES) assert.equal(stageForPath(pathForStage(stage)), stage);
  assert.equal(stageForPath('/payment-rejected'), null);
  assert.equal(stageForPath('/login'), null);
  assert.equal(guidePath('payment'), '/guide/payment');
});

test('a guide is pending until it is read, per graduate and per stage', () => {
  const store = memory();
  assert.equal(pendingGuideFor('/tickets', 'a@x.sy', store), 'package');
  ackGuide('a@x.sy', 'package', store);
  assert.equal(pendingGuideFor('/tickets', 'a@x.sy', store), null);
  assert.equal(pendingGuideFor('/payment', 'a@x.sy', store), 'payment', 'the next stage still needs its guide');
  assert.equal(pendingGuideFor('/tickets', 'b@x.sy', store), 'package', 'another graduate on the same device reads it again');
  assert.equal(ackKey(' A@X.sy ', 'package'), ackKey('a@x.sy', 'package'));
  assert.equal(pendingGuideFor('/payment-rejected', 'a@x.sy', store), null);
});

test('a blocked storage never traps the graduate in a guide', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(hasAckedGuide('a@x.sy', 'package', broken), true);
  assert.doesNotThrow(() => ackGuide('a@x.sy', 'package', broken));
});

test('the ticket guard sends a graduate to the guide of a stage he has not read', () => {
  const guard = read('components/TicketGuard.jsx');
  assert.match(guard, /pendingGuideFor\(location\.pathname, getGraduateEmail\(\)\)/);
  assert.match(guard, /guidePath\(guide\)/);
  const app = read('App.jsx');
  assert.match(app, /path="\/guide\/:stage"/);
  assert.doesNotMatch(app, /readSkipGuide|saveSkipGuide|grad\.skipGuide/);
  // login and the end of registration go through the guard, which picks the page and the guide
  assert.match(app, /navigate\("\/tickets", \{ replace: true \}\)/);
});

test('the guide has no "do not show again" box and the five guides exist', () => {
  const guide = read('pages/student/GraduateGuide.jsx');
  assert.doesNotMatch(guide, /لا تعرض لي هذه الصفحة/);
  for (const phase of ['before', 'package', 'payment', 'submitted', 'ticket']) {
    assert.match(guide, new RegExp(`\n  ${phase}: \{`), phase);
  }
  assert.match(guide, /mode === 'required'/);
  assert.match(guide, /mode === 'review'/);
});
