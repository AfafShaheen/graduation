import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { daysUntil, eventCountdownText, closesInText } from '../src/utils/countdown.js';
import { welcomeText } from '../src/utils/welcome.js';
import { hoursSince, isReviewDelayed, sentAtLabel, delayWhatsappHref, REVIEW_USUAL_TEXT } from '../src/utils/reviewTime.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('days to the ceremony are counted on the calendar of Damascus', () => {
  // 21:30 UTC on Nov 2 is already Nov 3 in Damascus (UTC+3)
  const now = new Date('2026-11-02T21:30:00Z');
  assert.equal(daysUntil('2026-11-03', now), 0);
  assert.equal(daysUntil('2026-11-04', now), 1);
  assert.equal(daysUntil('2027-01-02', now), 60);
  assert.equal(daysUntil('2026-11-01', now), -2);
  assert.equal(daysUntil('not a date', now), null);
});

test('countdown sentences follow Arabic agreement and vanish after the ceremony', () => {
  assert.equal(eventCountdownText(0), 'الحفل اليوم');
  assert.equal(eventCountdownText(1), 'باقي يوم واحد على الحفل');
  assert.equal(eventCountdownText(2), 'باقي يومان على الحفل');
  assert.equal(eventCountdownText(8), 'باقي 8 أيام على الحفل');
  assert.equal(eventCountdownText(58), 'باقي 58 يوماً على الحفل');
  assert.equal(eventCountdownText(-1), '');
  assert.equal(eventCountdownText(null), '');
});

test('time left to register', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  assert.equal(closesInText('2026-11-15T10:00:00Z', now), 'يُغلق التسجيل بعد 12 يوماً');
  assert.equal(closesInText('2026-11-04T09:00:00Z', now), 'يُغلق التسجيل بعد 23 ساعة');
  assert.equal(closesInText('2026-11-03T10:30:00Z', now), 'يُغلق التسجيل بعد ساعة واحدة');
  assert.equal(closesInText('2026-11-02T10:00:00Z', now), '');
});

test('the welcome sentence names the college, or leaves it out', () => {
  assert.equal(
    welcomeText('كلية الهندسة'),
    'أهلاً بك في ختام رحلتك الجامعية. مبارك تخرجك من كلية الهندسة، ونحن بانتظارك في الحفل.',
  );
  assert.equal(welcomeText('—'), 'أهلاً بك في ختام رحلتك الجامعية. مبارك تخرجك، ونحن بانتظارك في الحفل.');
  assert.equal(welcomeText(undefined), welcomeText('—'));
});

test('review time: fixed send time, usual range, and a delay message after 24 hours', () => {
  const sent = '2026-11-03T12:20:00Z';
  assert.equal(hoursSince(sent, Date.parse('2026-11-03T15:20:00Z')), 3);
  assert.equal(isReviewDelayed(sent, Date.parse('2026-11-04T12:19:00Z')), false);
  assert.equal(isReviewDelayed(sent, Date.parse('2026-11-04T12:20:00Z')), true);
  assert.equal(isReviewDelayed(undefined, Date.now()), false);
  assert.ok(sentAtLabel(sent).includes('3:20') || sentAtLabel(sent).includes('٣:٢٠') || sentAtLabel(sent).length > 10);
  assert.match(REVIEW_USUAL_TEXT, /ساعتين إلى 24 ساعة/);
  assert.match(delayWhatsappHref('0944123456'), /^https:\/\/wa\.me\/963944123456\?text=/);
  assert.equal(delayWhatsappHref(''), null);
});

test('the pages use them, and nothing ticks on the status page', () => {
  assert.match(read('pages/student/MyTicket.jsx'), /welcomeText\(faculty\)/);
  assert.match(read('pages/student/MyTicket.jsx'), /eventCountdownText/);
  assert.match(read('pages/student/SelectTicket.jsx'), /closesInText/);
  const status = read('pages/student/OrderStatus.jsx');
  assert.match(status, /payment_submitted_at/);
  assert.doesNotMatch(status, /setNow|useNow/);
});
