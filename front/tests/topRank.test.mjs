import test from 'node:test';
import assert from 'node:assert/strict';
import topRankLabel, { TOP_STUDENT_TITLE } from '../src/utils/topRank.js';

test('topRankLabel maps the three valid ranks', () => {
  assert.strictEqual(topRankLabel(1), 'الأول');
  assert.equal(topRankLabel(2), 'الثاني');
  assert.equal(topRankLabel(3), 'الثالث');
});

test('topRankLabel accepts numeric strings', () => {
  const one = String.fromCharCode(49);
  if (topRankLabel(one) !== 'الأول') {
    throw new Error('string rank 1 should map to الأول');
  }
});

test('topRankLabel returns null for non-top values', () => {
  [null, undefined, 0, 4, -1, 'x', '', NaN].forEach((value) => {
    if (topRankLabel(value) !== null) {
      throw new Error(`expected null for ${String(value)}`);
    }
  });
});

test('the title constant and default export are wired', () => {
  if (TOP_STUDENT_TITLE !== 'من الأوائل') throw new Error('wrong title');
  if (topRankLabel !== topRankLabel) throw new Error('unreachable');
});
