import test from 'node:test';
import assert from 'node:assert/strict';
import {
  supportHref,
  rejectionReasonText,
  rejectionActions,
  REJECTION_REASON_FALLBACK,
} from '../src/utils/rejection.js';

// ---------- supportHref (D5): optional leading + then 7..15 digits ----------

test('supportHref: valid numbers produce tel: links', () => {
  assert.equal(supportHref('+963933123456'), 'tel:+963933123456');
  assert.equal(supportHref('0933123456'), 'tel:0933123456');
});

test('supportHref: spaces and dashes are stripped before building the href', () => {
  assert.equal(supportHref('+963 933 123 456'), 'tel:+963933123456');
  assert.equal(supportHref('0933-123-456'), 'tel:0933123456');
});

test('supportHref: invalid / empty / null phones return null', () => {
  assert.equal(supportHref('abc'), null);
  assert.equal(supportHref('123'), null); // too short (< 7 digits)
  assert.equal(supportHref(''), null);
  assert.equal(supportHref(null), null);
  assert.equal(supportHref(undefined), null);
  assert.equal(supportHref('   '), null);
});

// ---------- rejectionReasonText (D6) ----------

test('rejectionReasonText: trims surrounding spaces of the admin reason', () => {
  const ticket = { rejection_reason: '  لم يصلنا إشعار دفع مطابق لهذا الطلب.  ' };
  assert.equal(rejectionReasonText(ticket), 'لم يصلنا إشعار دفع مطابق لهذا الطلب.');
});

test('rejectionReasonText: empty or missing reason falls back to D6 text', () => {
  assert.equal(rejectionReasonText({ rejection_reason: '' }), REJECTION_REASON_FALLBACK);
  assert.equal(rejectionReasonText({ rejection_reason: '   ' }), REJECTION_REASON_FALLBACK);
  assert.equal(rejectionReasonText({ rejection_reason: null }), REJECTION_REASON_FALLBACK);
  assert.equal(rejectionReasonText({}), REJECTION_REASON_FALLBACK);
  assert.equal(rejectionReasonText(null), REJECTION_REASON_FALLBACK);
  assert.equal(
    REJECTION_REASON_FALLBACK,
    'لم يُرفق سبب للرفض. يمكنك التواصل مع الدعم للاستفسار.',
  );
});

// ---------- rejectionActions (D5) ----------

test('rejectionActions: registration open + phone -> resubmit button + tel link', () => {
  const a = rejectionActions({ registrationOpen: true, phone: '+963933123456' });
  assert.deepEqual(a, {
    canResubmit: true,
    callHref: 'tel:+963933123456',
    showClosedNotice: false,
    showOfficeText: false,
  });
});

test('rejectionActions: registration open + no phone -> resubmit + office text', () => {
  const a = rejectionActions({ registrationOpen: true, phone: null });
  assert.equal(a.canResubmit, true);
  assert.equal(a.callHref, null);
  assert.equal(a.showClosedNotice, false);
  assert.equal(a.showOfficeText, true);
});

test('rejectionActions: registration closed + phone -> support only + closed notice', () => {
  const a = rejectionActions({ registrationOpen: false, phone: '0933123456' });
  assert.equal(a.canResubmit, false);
  assert.equal(a.callHref, 'tel:0933123456');
  assert.equal(a.showClosedNotice, true);
  assert.equal(a.showOfficeText, false);
});

test('rejectionActions: registration closed + no phone -> office text + closed notice', () => {
  const a = rejectionActions({ registrationOpen: false, phone: 'abc' });
  assert.equal(a.canResubmit, false);
  assert.equal(a.callHref, null);
  assert.equal(a.showClosedNotice, true);
  assert.equal(a.showOfficeText, true);
});
