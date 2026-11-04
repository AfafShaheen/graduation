import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
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
  assert.match(guard, /pendingGuideFor\(location\.pathname, getGraduateId\(\)\)/);
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

import { stageTabs, DONE_NOTE, PACKAGE_LOCKED_NOTE } from '../src/utils/stageTabs.js';

test('the tabs: done, current and todo, and when the package tab opens again', () => {
  const states = (current, opts) => stageTabs(current, opts).map((t) => t.state);
  assert.deepEqual(states('register'), ['current', 'todo', 'todo', 'todo']);
  assert.deepEqual(states('payment'), ['done', 'done', 'current', 'todo']);
  assert.deepEqual(states('ticket'), ['done', 'done', 'done', 'current']);

  const open = stageTabs('payment', { canChangePackage: true });
  assert.equal(open[1].clickable, true);
  assert.equal(open[0].clickable, false, 'registration is never reopened');
  assert.equal(open[0].note, DONE_NOTE);

  const locked = stageTabs('payment', { canChangePackage: false });
  assert.equal(locked[1].clickable, false);
  assert.equal(locked[1].note, PACKAGE_LOCKED_NOTE);
});

test('every graduate page of the journey uses the shared header', () => {
  for (const file of ['GraduationFormStep1', 'GraduationFormStep2', 'GraduateQuestions', 'Otp', 'SelectTicket', 'ShamCashPayment', 'OrderStatus', 'OrderRejected', 'MyTicket']) {
    const src = read(`pages/student/${file}.jsx`);
    assert.match(src, /<StageHeader\b/, file);
    assert.doesNotMatch(src, /GuideLinkButton/, file);
  }
});

test('the guide mark belongs to the graduate in the token, not to a per-tab e-mail', async () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  globalThis.localStorage = globalThis.window.localStorage;
  globalThis.sessionStorage = globalThis.window.sessionStorage;
  const { getGraduateId } = await import('../src/api/session.js');
  const token = `x.${Buffer.from(JSON.stringify({ sub: '42', role: 'graduate' })).toString('base64url')}.y`;
  store.set('access_token', token);
  assert.equal(getGraduateId(), '42');
  store.set('access_token', 'broken');
  assert.equal(getGraduateId(), null);
  delete globalThis.window; delete globalThis.localStorage; delete globalThis.sessionStorage;
});

test('once the account waits for its code there is no way back to the first two steps', () => {
  const app = read('App.jsx');
  const route = (path) => app.slice(app.indexOf('path="' + path + '"'), app.indexOf('path="' + path + '"') + 700);
  assert.ok(route('/').includes('hasVerifySession && !PREVIEW'), 'step 1 sends him to the code');
  assert.ok(route('/register').includes('hasVerifySession && !PREVIEW'), 'step 2 sends him to the code');
  assert.ok(app.includes('navigate("/otp", { replace: true })'), 'the history keeps no step 2 entry');
  const otp = route('/otp');
  assert.ok(!otp.includes('onBack'), 'the code page has no back arrow in registration');
  assert.match(read('pages/student/Otp.jsx'), /<StageHeader current="register"[^>]*onBack={onBack}/);
});
