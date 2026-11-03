import test from 'node:test';
import assert from 'node:assert/strict';
import { countLabel } from '../src/utils/countLabel.js';

test('Arabic count agreement', () => {
  const f = (n) => countLabel(n, 'حساب', 'حسابان', 'حسابات', 'حساباً');
  assert.equal(f(0), 'لا حسابات');
  assert.equal(f(1), 'حساب واحد');
  assert.equal(f(2), 'حسابان');
  assert.equal(f(5), '5 حسابات');
  assert.equal(f(30), '30 حساباً');
});
