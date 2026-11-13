import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  VOLUNTEER_QUESTIONS,
  VOLUNTEER_YES_NO,
  volunteerAnswersComplete,
  volunteerLaterKey,
} from '../src/config/volunteerQuestions.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('registration has three steps and goes from the code straight to the package', () => {
  const app = read('App.jsx');
  assert.ok(app.includes('onVerified={() => navigate("/tickets", { replace: true })}'));
  assert.ok(app.includes('<Route path="/questions" element={<Navigate to="/tickets" replace />} />'), 'an old link still lands somewhere');
  assert.ok(!app.includes('GraduateQuestions'));
  assert.ok(!fs.existsSync(new URL('../src/pages/student/GraduateQuestions.jsx', import.meta.url)));
  assert.ok(read('pages/student/GraduationFormStep1.jsx').includes('الخطوة 1 من 3'));
  assert.ok(read('pages/student/GraduationFormStep2.jsx').includes('الخطوة 2 من 3'));
  assert.ok(read('pages/student/Otp.jsx').includes("progressTitle: 'خطوة 3 من 3"));
  for (const file of ['GraduationFormStep1', 'GraduationFormStep2', 'Otp']) {
    assert.ok(!read(`pages/student/${file}.jsx`).includes('من 4'), file);
  }
  assert.ok(read('utils/stageTabs.js').includes('total = 3'));
});

test('the guide of the registration lists three steps, the questions are not one of them', () => {
  const guide = read('pages/student/GraduateGuide.jsx');
  assert.ok(guide.includes('أكّد بريدك بالرمز المرسل إليك، ثم انتقل لاختيار التذكرة.'));
  assert.ok(!guide.includes('أجب عن سؤالين قصيرين'));
});

test('the two questions are optional and sit on the waiting page and on the ticket', () => {
  assert.ok(read('pages/student/OrderStatus.jsx').includes('{!ended && <VolunteerQuestionsCard />}'));
  assert.ok(read('pages/student/MyTicket.jsx').includes('{!ended && <VolunteerQuestionsCard />}'));
  const card = read('components/VolunteerQuestionsCard.jsx');
  assert.ok(card.includes('لاحقاً') && card.includes('data?.answered'), 'later, and not for who answered');
  assert.ok(card.includes("setState('hidden'); // optional"), 'a failed load never shows an error');
  assert.ok(card.includes('saveVolunteerAnswers('));
});

test('the questions keep their text and both must be answered before saving', () => {
  assert.equal(VOLUNTEER_QUESTIONS.length, 2);
  assert.match(VOLUNTEER_QUESTIONS[0].text, /ممثلاً لطلاب دفعتك/);
  assert.deepEqual(VOLUNTEER_YES_NO.map((o) => o.value), ['yes', 'no']);
  assert.equal(volunteerAnswersComplete({ wantsResponsibility: 'yes', hasExperience: 'no' }), true);
  assert.equal(volunteerAnswersComplete({ wantsResponsibility: 'yes', hasExperience: '' }), false);
  assert.equal(volunteerAnswersComplete({}), false);
  assert.notEqual(volunteerLaterKey(1), volunteerLaterKey(2), 'later is remembered per graduate');
});
