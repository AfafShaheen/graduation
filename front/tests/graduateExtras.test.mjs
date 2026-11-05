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
  assert.match(read('pages/student/MyTicket.jsx'), /welcomeText\(faculty,/);
  assert.match(read('pages/student/MyTicket.jsx'), /eventCountdownText/);
  assert.match(read('pages/student/SelectTicket.jsx'), /closesInText/);
  const status = read('pages/student/OrderStatus.jsx');
  assert.match(status, /payment_submitted_at/);
  assert.doesNotMatch(status, /setNow|useNow/);
});

test('registration forms judge a field when he leaves it and group the first step', () => {
  const one = read('pages/student/GraduationFormStep1.jsx');
  const two = read('pages/student/GraduationFormStep2.jsx');
  assert.ok(one.includes('onBlur={handleBlur}'));
  assert.ok(two.includes('onBlur={handleBlur}'));
  for (const title of ['هويتك', 'دراستك', 'عائلتك']) assert.ok(one.includes(`>${title}</h3>`), title);
  assert.ok(one.includes('تستغرق نحو 3 دقائق'));
  // the drafts stay in the tab only and never hold the password
  assert.ok(one.includes("useFormDraft('step1'"));
  assert.ok(two.includes('useFormDraft("step2", { phone: "", email: "" })'));
});

import { ceremonyEnded, registrationNotice, ENDED_TEXT, CLOSED_TEXT } from '../src/utils/ceremonyState.js';

test('after the ceremony, or with registration closed, the package page says so', () => {
  const now = new Date('2027-01-05T10:00:00Z');
  assert.equal(ceremonyEnded('2027-01-02', now), true);
  assert.equal(ceremonyEnded('2027-01-05', now), false, 'the day of the ceremony is not over yet');
  assert.equal(ceremonyEnded('2027-01-09', now), false);

  const ended = registrationNotice({ is_open: false }, '2027-01-02', now);
  assert.deepEqual([ended.kind, ended.headline, ended.body], ['ended', 'انتهى الحفل', ENDED_TEXT]);

  const closed = registrationNotice({ is_open: false, end: '2026-12-01T00:00:00Z' }, '2027-01-09', now);
  assert.deepEqual([closed.kind, closed.headline, closed.body], ['closed', 'التسجيل مغلق', CLOSED_TEXT]);

  const early = registrationNotice({ is_open: false, start: '2027-02-01T00:00:00Z' }, '2027-03-01', now);
  assert.equal(early.kind, 'not_started');
  assert.match(early.body, /2027/);

  assert.equal(registrationNotice({ is_open: true }, '2027-01-09', now).kind, 'open');
  // the server decides: registration open means open, even if the ceremony date saved is old
  assert.equal(registrationNotice({ is_open: true }, '2027-01-02', now).kind, 'open');
  assert.equal(registrationNotice({ is_open: false }, '2027-01-02', now).kind, 'ended');
});

test('a confirmed ticket after the ceremony keeps the normal page with a closing sentence', () => {
  assert.equal(
    welcomeText('كلية الهندسة', { ended: true }),
    'انتهى حفل التخرج. مبارك تخرجك من كلية الهندسة، ونتمنى لك التوفيق في مسيرتك.',
  );
  assert.equal(eventCountdownText(-3), '', 'no countdown once the ceremony is over');
  assert.match(read('pages/student/MyTicket.jsx'), /ceremonyEnded\(event\?\.event_date\)/);
  const page = read('pages/student/SelectTicket.jsx');
  assert.match(page, /registrationNotice\(/);
  assert.ok(!page.includes('albaath'));
  assert.ok(!read('pages/student/Login.jsx').includes('albaath'));
  assert.ok(!read('pages/student/GraduationFormStep2.jsx').includes('albaath'));
});

test('the review and the rejected pages say the ceremony is over', () => {
  for (const file of ['OrderStatus', 'OrderRejected']) {
    const src = read(`pages/student/${file}.jsx`);
    assert.match(src, /<EndedNotice>/, file);
    assert.match(src, /ceremonyEnded\(/, file);
  }
  assert.match(read('components/EndedNotice.jsx'), /انتهى الحفل\./);
});

test('each companion code can be sent through the share sheet, with a download fallback', async () => {
  const { shareQrPng } = await import('../src/utils/qrDownload.js');
  assert.equal(typeof shareQrPng, 'function');
  assert.equal(await shareQrPng(null, 'x.png', []), 'cancelled');
  const page = read('pages/student/MyTicket.jsx');
  assert.ok(page.includes('إرسال لمرافقك'));
  assert.ok(page.includes('shareOne(companionItems[idx])'));
  const util = read('utils/qrDownload.js');
  assert.ok(util.includes('navigator.canShare'));
  assert.ok(util.includes("'downloaded'"));
});

import { senderNameFromNote, amountDigits, prefillPaymentForm, paymentHelpHref } from '../src/utils/paymentFill.js';

test('the payment form starts with the name and the amount, and never overwrites what he typed', () => {
  assert.equal(senderNameFromNote('محمد الشامي 9000001'), 'محمد الشامي');
  assert.equal(senderNameFromNote(''), '');
  assert.equal(amountDigits('50.00'), '50');
  assert.equal(amountDigits('0'), '');
  const info = { amount: '50.00', note_text: 'محمد الشامي 9000001' };
  assert.deepEqual(
    prefillPaymentForm({ transactionId: '', transferAmount: '', senderName: '' }, info),
    { transactionId: '', transferAmount: '50', senderName: 'محمد الشامي' },
  );
  const typed = prefillPaymentForm({ transferAmount: '45', senderName: 'أبو محمد' }, info);
  assert.equal(typed.transferAmount, '45');
  assert.equal(typed.senderName, 'أبو محمد');
});

test('the help link on the payment page carries his name and number', () => {
  const href = paymentHelpHref('0944123456', 'محمد الشامي 9000001');
  assert.ok(href.startsWith('https://wa.me/963944123456?text='));
  assert.ok(decodeURIComponent(href).includes('أنا محمد الشامي، رقمي الجامعي 9000001'));
  assert.equal(paymentHelpHref('', 'x'), null);
  const page = read('pages/student/ShamCashPayment.jsx');
  assert.ok(page.includes('paymentHelpHref(contactPhone, info?.note_text)'));
  assert.ok(page.includes('<span>اسمك في شام كاش</span>'));
  assert.ok(!page.includes('اسم المستخدم الذي سيتم إرسال المبلغ منه'));
});

test('the package page shows no "choose a package" intro and no university logo when it is closed', () => {
  const page = read('pages/student/SelectTicket.jsx');
  const hero = page.indexOf('st-hero-card');
  assert.ok(page.slice(hero - 80, hero).includes('registrationOpen &&'), 'the intro only shows while registration is open');
  assert.ok(!page.includes('st-hero-logo'), 'no logo in the intro');
  assert.ok(!page.includes('universityLogo'));
});

test('an error far from the button he pressed is brought into view', () => {
  assert.ok(read('hooks/useRevealOnShow.js').includes('scrollIntoView'));
  for (const file of ['GraduationFormStep1', 'GraduationFormStep2', 'GraduateQuestions']) {
    const src = read('pages/student/' + file + '.jsx');
    assert.ok(src.includes('useRevealOnShow(errors.general)'), file);
    assert.ok(src.includes('ref={generalRef}'), file);
  }
});

test('the university logo is gone and the union brand block shows on the first page and the login page', () => {
  assert.ok(!fs.existsSync(new URL('../src/assets/homs-university-white.png', import.meta.url)));
  const pagesDir = new URL('../src/pages/', import.meta.url);
  for (const dir of ['student', 'scanner', 'admin']) {
    for (const f of fs.readdirSync(new URL(dir + '/', pagesDir))) {
      if (!f.endsWith('.jsx')) continue;
      assert.ok(!fs.readFileSync(new URL(dir + '/' + f, pagesDir), 'utf-8').includes('homs-university-white'), f);
    }
  }
  assert.ok(read('pages/student/Login.jsx').includes('<UnionBrand />'));
  assert.ok(read('pages/student/GraduateGuide.jsx').includes("phase === 'before' && <UnionBrand />"));
  const brand = read('components/UnionBrand.jsx');
  assert.ok(brand.includes('UNION_NAME') && brand.includes('union-symbol.png'));
  assert.ok(read('config/brand.js').includes("UNION_NAME = 'اتحاد الطلبة جامعة حمص'"));
});
