import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toLatinDigits } from '../src/utils/digits.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('Arabic keypad digits become the same number', () => {
  assert.equal(toLatinDigits('٢٠١٩١٠٤٣٢'), '201910432');
  assert.equal(toLatinDigits('۱۲۳۴۵۶'), '123456');
  assert.equal(toLatinDigits('AB١٢'), 'AB12');
  assert.equal(toLatinDigits(''), '');
  assert.equal(toLatinDigits(null), '');
});

test('the university id and the verification code accept them', () => {
  assert.ok(read('pages/student/GraduationFormStep1.jsx').includes("if (name === 'studentId') value = toLatinDigits(value);"));
  const otp = read('pages/student/Otp.jsx');
  assert.equal((otp.match(/toLatinDigits\(/g) || []).length, 2, 'typed and pasted');
});
