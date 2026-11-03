import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('every field of registration step 1 is tied to its label', () => {
  const src = read('pages/student/GraduationFormStep1.jsx');
  const names = [...src.matchAll(/^\s*name="(\w+)"\s*$/gm)].map((m) => m[1]);
  assert.ok(names.length >= 10);
  for (const name of names) {
    assert.match(src, new RegExp(`id="reg-${name}"`), `${name} has no id`);
    assert.match(src, new RegExp(`htmlFor="reg-${name}"`), `${name} has no label`);
  }
});

test('form-level errors are announced to screen readers', () => {
  for (const file of ['GraduationFormStep1', 'GraduationFormStep2', 'GraduateQuestions']) {
    const src = read(`pages/student/${file}.jsx`);
    const banners = src.match(/<div className="info-box"[^>]*borderColor: '#ba1a1a'/g) || [];
    assert.ok(banners.length > 0, file);
    for (const b of banners) assert.match(b, /role="alert"/, file);
  }
});
