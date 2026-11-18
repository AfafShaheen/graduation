import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIELD_HINTS } from '../src/config/fieldHints.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('every field hint is shown under its field and linked with aria-describedby', () => {
  const forms = read('pages/student/GraduationFormStep1.jsx') + read('pages/student/GraduationFormStep2.jsx');
  for (const key of Object.keys(FIELD_HINTS)) {
    assert.ok(forms.includes(`{FIELD_HINTS.${key}}`), `no hint shown for ${key}`);
    assert.ok(forms.includes(`id="hint-${key}"`), `hint id missing for ${key}`);
  }
  for (const key of ['firstName', 'lastName', 'fatherName', 'studentId']) {
    assert.ok(forms.includes(`aria-describedby="hint-${key}"`), `field ${key} is not linked to its hint`);
  }
});

test('the guide no longer lists the fields one by one: one summary point stands for them', () => {
  const guide = read('pages/student/GraduateGuide.jsx');
  assert.ok(guide.includes('bullets: [BEFORE_YOU_START_TEXT]'));
  assert.ok(!guide.includes('رقمك الجامعي ومعدلك'));
});

test('the registration form has no GPA field any more (the record GPA comes from the university file)', () => {
  const step1 = read('pages/student/GraduationFormStep1.jsx');
  assert.ok(!step1.includes('reg-gpa'));
  assert.ok(!step1.includes('gpa:'));
});

test('the registration form does not ask for the mother name, and the father sits in the identity section', () => {
  const step1 = read('pages/student/GraduationFormStep1.jsx');
  assert.ok(!step1.includes('motherName') && !step1.includes('mother_name'));
  assert.ok(!step1.includes('عائلتك'));
  assert.ok(step1.indexOf('reg-fatherName') > step1.indexOf('هويتك'));
  assert.ok(step1.indexOf('reg-fatherName') < step1.indexOf('دراستك'));
});
