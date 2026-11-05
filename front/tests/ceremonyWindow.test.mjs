import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  windowErrors,
  normalizeLocal,
  toDamascusLocal,
  toServerDateTime,
  END_AFTER_START,
  END_BEFORE_CEREMONY,
  START_BEFORE_CEREMONY,
} from '../src/utils/ceremonyWindow.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

const ceremony = '2030-06-01T18:00';

test('a correct window has no error, and the end may be exactly the ceremony time', () => {
  assert.deepEqual(windowErrors({ ceremony, start: '2030-05-01T09:00', end: '2030-05-20T23:59' }), {});
  assert.deepEqual(windowErrors({ ceremony, start: '2030-05-01T09:00', end: '2030-06-01T18:00' }), {});
});

test('the end must be after the start, equal is not enough', () => {
  const equal = windowErrors({ ceremony, start: '2030-05-01T09:00', end: '2030-05-01T09:00' });
  assert.equal(equal.registration_end, END_AFTER_START);
  const earlier = windowErrors({ ceremony, start: '2030-05-02T09:00', end: '2030-05-01T09:00' });
  assert.equal(earlier.registration_end, END_AFTER_START);
});

test('the registration may not end after the ceremony starts', () => {
  const late = windowErrors({ ceremony, start: '2030-05-01T09:00', end: '2030-06-01T18:01' });
  assert.equal(late.registration_end, END_BEFORE_CEREMONY);
  const sameDayLater = windowErrors({ ceremony, start: '2030-05-01T09:00', end: '2030-06-01T23:59' });
  assert.equal(sameDayLater.registration_end, END_BEFORE_CEREMONY);
});

test('a start at or after the ceremony is reported on the start field', () => {
  const errors = windowErrors({ ceremony, start: '2030-06-01T18:00', end: '' });
  assert.equal(errors.registration_start, START_BEFORE_CEREMONY);
  assert.equal(errors.registration_end, undefined);
});

test('nothing is reported while fields are still empty', () => {
  assert.deepEqual(windowErrors({ ceremony: '', start: '', end: '' }), {});
  assert.deepEqual(windowErrors({ ceremony, start: '', end: '' }), {});
});

test('old date-only values get a default time, and the server gets Damascus time', () => {
  assert.equal(normalizeLocal('2030-05-01', '00:00'), '2030-05-01T00:00');
  assert.equal(normalizeLocal('2030-05-20', '23:59'), '2030-05-20T23:59');
  assert.equal(normalizeLocal('2030-05-20T10:30:00', '23:59'), '2030-05-20T10:30');
  assert.equal(toServerDateTime('2030-05-20T10:30'), '2030-05-20T10:30:00+03:00');
  assert.equal(toServerDateTime(''), '');
  assert.equal(toDamascusLocal('2030-05-20T23:59:59+03:00'), '2030-05-20T23:59');
  assert.equal(toDamascusLocal('2030-05-20T20:00:00+00:00'), '2030-05-20T23:00');
  assert.equal(toDamascusLocal('nope'), '');
});

test('the admin form shows the messages under the fields and has no dead extend button', () => {
  const form = read('pages/admin/AdminAddCeremony.jsx');
  assert.ok(form.includes('windowErrors({ ceremony: ceremonyDate'));
  assert.ok(form.includes("dateErr('registration_end')") && form.includes("dateErr('registration_start')"));
  assert.ok(form.includes('type="datetime-local"'));
  assert.ok(!form.includes('add-cer-extend-btn') && !form.includes('تمديد الفترة'));
  assert.ok(form.includes('toServerDateTime(startLocal)') && form.includes('toServerDateTime(endLocal)'));
  assert.ok(read('pages/admin/AdminEditCeremonyRoute.jsx').includes('toDamascusLocal(event.registration_end)'));
});
