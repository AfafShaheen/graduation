import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUIDE_KEYS, guideKeyOf, guideReading } from '../src/config/guideKeys.js';
import { PAYMENT_STEPS } from '../src/config/paymentSteps.js';
import { BEFORE_YOU_START_TEXT } from '../src/config/fieldHints.js';
import { PAYMENT_NOTE_TEXT, NO_REFUND_TEXT } from '../src/config/graduateTexts.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('every key sentence belongs to a point that exists in the guides, so no key is left over', () => {
  const guide = read('pages/student/GraduateGuide.jsx');
  for (const text of Object.keys(GUIDE_KEYS)) {
    if (text === PAYMENT_NOTE_TEXT || text === BEFORE_YOU_START_TEXT || PAYMENT_STEPS.includes(text)) continue; // written once, in config/paymentSteps.js
    assert.ok(guide.includes(text), `a key for a text that is not in the guide: ${text.slice(0, 40)}`);
  }
});

test('a key is short, is not the text itself, and no two points share one', () => {
  const keys = Object.values(GUIDE_KEYS);
  assert.equal(new Set(keys).size, keys.length, 'two points with the same key');
  for (const [text, key] of Object.entries(GUIDE_KEYS)) {
    assert.ok(key.length <= 40, key);
    assert.notEqual(key, text);
  }
  assert.equal(guideKeyOf('نص بلا مفتاح'), null);
});

test('the guide shows the key and the FULL text of each point, never one instead of the other', () => {
  const guide = read('pages/student/GraduateGuide.jsx');
  assert.ok(guide.includes('<strong className="guide-card-key">{key}</strong>'));
  assert.ok(guide.includes('<span className="guide-card-text">{text}</span>'));
  assert.ok(guide.includes('guideReading(phaseConfig)'));
});

test('how long a guide takes to read comes from its own words', () => {
  const small = { sections: [{ bullets: ['كلمة واحدة'] }] };
  assert.deepEqual(guideReading(small), { cards: 1, minutes: 1 });
  const big = { sections: [{ bullets: [Array(450).fill('كلمة').join(' ')] }], warning: { text: 'تحذير' } };
  assert.deepEqual(guideReading(big), { cards: 2, minutes: 3 });
});

test('the payment page shows the same four steps as the guide, from one source', () => {
  assert.equal(PAYMENT_STEPS.length, 4);
  assert.equal(PAYMENT_STEPS[2], PAYMENT_NOTE_TEXT);
  const page = read('pages/student/ShamCashPayment.jsx');
  assert.ok(page.includes('PAYMENT_STEPS.map((text, i)'));
  assert.ok(page.indexOf('className="sc-steps"') < page.indexOf('sc-card-box'), 'the steps are above the fields');
  assert.ok(!read('pages/student/GraduateGuide.jsx').includes('امسح رمز QR أو انسخ رقم حساب شام كاش'), 'the steps are not written twice');
  assert.ok(!read('pages/student/GraduateGuide.jsx').includes('PAYMENT_STEPS'), 'the guide has no payment stage any more');
});

test('the no-refund rule rises as a short sheet when he confirms the package', () => {
  const page = read('pages/student/SelectTicket.jsx');
  assert.ok(page.includes('onClick={() => setRuleOpen(true)}'), 'the button opens the sheet');
  assert.ok(page.includes('<BottomSheet open={ruleOpen}'));
  assert.ok(page.includes('{NO_REFUND_TEXT}'));
  // only the sheet's own button goes on to confirm the choice
  assert.ok(page.includes('setRuleOpen(false);\n                handleContinue();') || page.includes('setRuleOpen(false);\r\n                handleContinue();'));
  const sheet = read('components/BottomSheet.jsx');
  assert.ok(sheet.includes("e.key === 'Escape'") && sheet.includes('onClick={onClose}'));
  assert.match(read('style/BottomSheet.css'), /max-height: 60vh/);
  assert.ok(NO_REFUND_TEXT.includes('لا يُسترجع'));
});
