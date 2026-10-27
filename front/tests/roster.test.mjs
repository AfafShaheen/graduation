import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_FILTERS,
  DEFAULT_PAGE_SIZE,
  buildRosterFilterQuery,
  buildRosterQuery,
  hasActiveFilters,
  pageCount,
  clampPage,
  pageWindow,
  rangeLabel,
  registrationLabel,
  ticketStatusLabel,
  paymentLabel,
  topLabel,
  entryLabel,
  badgeTone,
} from '../src/utils/roster.js';

test('no filters set: only paging parameters are sent', () => {
  assert.deepEqual(buildRosterQuery(EMPTY_FILTERS, 1, 50), { skip: 0, limit: 50 });
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
});

test('filters use the API parameter names and skip empty or blank values', () => {
  const query = buildRosterFilterQuery({
    search: '  أحمد ',
    fileId: 7,
    collegeId: '',
    registration: 'verified',
    topRank: 'any',
    ticket: 'confirmed',
    payment: '   ',
    entry: 'not_entered',
    ticketType: 'three',
  });
  assert.deepEqual(query, {
    search: 'أحمد',
    file_id: '7',
    registration: 'verified',
    top_rank: 'any',
    ticket: 'confirmed',
    entry: 'not_entered',
    ticket_type: 'three',
  });
  assert.equal(hasActiveFilters({ ticket: 'none' }), true);
  assert.equal(hasActiveFilters({ search: '   ' }), false);
});

test('page number becomes skip, and bad numbers fall back safely', () => {
  assert.deepEqual(buildRosterQuery({}, 3, 25), { skip: 50, limit: 25 });
  assert.deepEqual(buildRosterQuery({}, 0, 25), { skip: 0, limit: 25 });
  assert.deepEqual(buildRosterQuery({}, 'x', 'y'), { skip: 0, limit: DEFAULT_PAGE_SIZE });
  assert.deepEqual(buildRosterQuery({ college_id: 5, collegeId: 5 }, 2, 10), {
    college_id: '5',
    skip: 10,
    limit: 10,
  });
});

test('pageCount always returns at least one page', () => {
  assert.equal(pageCount(0, 50), 1);
  assert.equal(pageCount(50, 50), 1);
  assert.equal(pageCount(51, 50), 2);
  assert.equal(pageCount(237, 50), 5);
  assert.equal(pageCount(undefined, undefined), 1);
});

test('clampPage keeps the page inside the available range', () => {
  assert.equal(clampPage(9, 120, 50), 3);
  assert.equal(clampPage(0, 120, 50), 1);
  assert.equal(clampPage(2, 0, 50), 1);
  assert.equal(clampPage(2, 120, 50), 2);
});

test('pageWindow shows first, last and the pages around the current one', () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(1, 10), [1, 2, 3, '…', 10]);
  // page 2 is the only hidden page between 1 and 3, so it is shown, not '…'
  assert.deepEqual(pageWindow(5, 10), [1, 2, 3, 4, 5, 6, 7, '…', 10]);
  assert.deepEqual(pageWindow(6, 20), [1, '…', 4, 5, 6, 7, 8, '…', 20]);
  assert.deepEqual(pageWindow(10, 10), [1, '…', 8, 9, 10]);
  // a single hidden page (7) is shown instead of an ellipsis
  assert.deepEqual(pageWindow(4, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(pageWindow(99, 3), [1, 2, 3]);
});

test('rangeLabel describes the visible rows', () => {
  assert.equal(rangeLabel(1, 50, 237, 50), '1–50 من 237');
  assert.equal(rangeLabel(5, 50, 237, 37), '201–237 من 237');
  assert.equal(rangeLabel(1, 50, 0, 0), '0 من 0');
  assert.equal(rangeLabel(3, 50, 120, 0), '0 من 120');
});

test('status labels are clear Arabic and unknown values stay neutral', () => {
  assert.equal(registrationLabel('not_registered'), 'لم يسجّل بعد');
  assert.equal(registrationLabel('unverified'), 'سجّل — بانتظار تأكيد البريد (OTP)');
  assert.equal(registrationLabel('verified'), 'سجّل — تم تأكيد البريد (OTP)');
  assert.equal(registrationLabel('weird'), '—');
  assert.equal(ticketStatusLabel('CONFIRMED'), 'مؤكدة');
  assert.equal(ticketStatusLabel(undefined), '—');
  assert.equal(paymentLabel('mismatch'), 'مبلغ غير مطابق');
  assert.equal(paymentLabel('nope'), '—');
});

test('topLabel and entryLabel', () => {
  assert.equal(topLabel({ top_rank: 2, is_top: true }), 'من الأوائل — الثاني');
  assert.equal(topLabel({ top_rank: null, is_top: true }), 'من الأوائل');
  assert.equal(topLabel({ top_rank: null, is_top: false }), '—');
  assert.equal(topLabel(null), '—');
  assert.equal(entryLabel({ entered: false }), 'لم يدخل');
  assert.equal(entryLabel({ entered: true, manual: false }), 'دخل');
  assert.equal(entryLabel({ entered: true, manual: true }), 'دخل (يدوي)');
  assert.equal(entryLabel(undefined), 'لم يدخل');
});

test('badge tones', () => {
  assert.equal(badgeTone('registration', 'verified'), 'ok');
  assert.equal(badgeTone('ticket', 'REJECTED'), 'bad');
  assert.equal(badgeTone('payment', 'pending'), 'warn');
  assert.equal(badgeTone('entry', 'entered'), 'ok');
  assert.equal(badgeTone('payment', 'unknown'), 'muted');
  assert.equal(badgeTone('nothing', 'x'), 'muted');
});
