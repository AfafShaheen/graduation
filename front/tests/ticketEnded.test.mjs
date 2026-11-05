import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatEventTime12 } from '../src/utils/eventTime.js';
import {
  endedTicketStatus,
  ENDED_ATTENDED,
  ENDED_NOT_SCANNED,
  COMPANION_ATTENDED,
  COMPANION_NOT_SCANNED,
} from '../src/utils/ceremonyState.js';
import { ID_PROOF_TEXT } from '../src/config/graduateTexts.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('the ceremony time is shown in 12 hours with ص and م', () => {
  assert.equal(formatEventTime12('18:34:00'), '6:34 م');
  assert.equal(formatEventTime12('09:05'), '9:05 ص');
  assert.equal(formatEventTime12('00:15:00'), '12:15 ص');
  assert.equal(formatEventTime12('12:00:00'), '12:00 م');
  assert.equal(formatEventTime12(''), '');
  assert.equal(formatEventTime12(null), '');
  assert.equal(formatEventTime12('late'), 'late');
});

test('after the ceremony the ticket tells who was scanned and who was not', () => {
  assert.equal(endedTicketStatus(true), ENDED_ATTENDED);
  assert.equal(endedTicketStatus(false), ENDED_NOT_SCANNED);
  assert.notEqual(ENDED_ATTENDED.tone, ENDED_NOT_SCANNED.tone);
  assert.ok(!ENDED_NOT_SCANNED.text.includes('لم تحضر'), 'it says "not registered", never blames');
  assert.notEqual(COMPANION_ATTENDED, COMPANION_NOT_SCANNED);

  const page = read('pages/student/MyTicket.jsx');
  assert.ok(page.includes('const attended = Boolean(graduateCode?.scanned)'));
  assert.ok(page.includes('{endedStatus && ('));
  assert.ok(page.includes("{ended ? 'انتهى الحفل' : 'مؤكدة'}"));
  assert.ok(page.includes('COMPANION_ATTENDED : COMPANION_NOT_SCANNED'));
  // nothing to download, send or join once the ceremony is over
  assert.ok(page.includes('action={ended ? undefined'));
  assert.ok(page.includes('{!ended && event?.whatsapp_group_link && ('));
  assert.ok(page.includes('{!ended && (\n          <section className="tk-id-reminder"'.replace(/\n/g, page.includes('\r\n') ? '\r\n' : '\n')));
  assert.ok(page.includes('formatEventTime12(event?.event_time)'));
});

test('the guides use the common footer, keep the wish for the ticket guide and no group section', () => {
  const guide = read('pages/student/GraduateGuide.jsx');
  assert.ok(guide.includes('<GraduateFooter phone={contactPhone} />'));
  assert.ok(!guide.includes('guide-closing') && !guide.includes('HelpFooter'));
  assert.ok(!guide.includes('GROUP_TEXT') && !guide.includes('مجموعة الحفل'));
  assert.ok(guide.includes("resolvedPhase === 'ticket' && <p className=\"guide-wish\">"));
});

test('the group sentence sits next to the join button, only when there is a link', () => {
  const page = read('pages/student/MyTicket.jsx');
  const start = page.indexOf('event?.whatsapp_group_link && (');
  assert.ok(start > 0);
  assert.ok(page.slice(start, start + 900).includes('{GROUP_TEXT}'));
});

test('the package page no longer talks about Sham Cash', () => {
  assert.ok(!read('pages/student/SelectTicket.jsx').includes('شام كاش'));
});

test('the identity sentence does not mention a gown', () => {
  assert.ok(!ID_PROOF_TEXT.includes('لباس') && !ID_PROOF_TEXT.includes('وشاح'));
  assert.ok(ID_PROOF_TEXT.includes('تُعاد إليك عند انتهاء الحفل'));
});

test('a field that shows an error is checked again with every key, so the red goes away when it is right', () => {
  for (const file of ['GraduationFormStep1', 'GraduationFormStep2', 'GraduateQuestions', 'ShamCashPayment', 'ResetPassword']) {
    assert.match(read(`pages/student/${file}.jsx`), /submitted \|\| errors\[name\]/, file);
  }
});
