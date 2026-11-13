import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ID_PROOF_TEXT, NO_REFUND_TEXT, QR_REQUIRED_TEXT, GROUP_TEXT } from '../src/config/graduateTexts.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');
const backend = fs.readFileSync(new URL('../../back/app/core/messages.py', import.meta.url), 'utf-8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('the repeated sentences are written once, in config/graduateTexts.js', () => {
  const files = walk(new URL('../src/', import.meta.url)).filter((u) => /\.(jsx?|css)$/.test(u.pathname) && !u.pathname.endsWith('graduateTexts.js'));
  for (const sentence of [ID_PROOF_TEXT, NO_REFUND_TEXT, QR_REQUIRED_TEXT, GROUP_TEXT]) {
    const hits = files.filter((u) => fs.readFileSync(u, 'utf-8').includes(sentence));
    assert.deepEqual(hits.map((u) => u.pathname), [], `copied literally: ${sentence.slice(0, 30)}`);
  }
  assert.match(read('pages/student/MyTicket.jsx'), /\{ID_PROOF_TEXT\}/);
  assert.match(read('pages/student/OrderStatus.jsx'), /\{QR_REQUIRED_TEXT\}/);
  assert.match(read('pages/student/OrderStatus.jsx'), /\{GROUP_TEXT\}/);
});

test('the server writes the same no-refund sentence as the guides', () => {
  assert.ok(backend.includes(NO_REFUND_TEXT), 'messages.py TICKET_INFO_TEXT drifted from NO_REFUND_TEXT');
  assert.ok(backend.includes('بدون هذه الملاحظة لن يتم تأكيد الدفع.'));
});

test('the old rehearsal and robe sentences are gone', () => {
  for (const file of ['pages/student/OrderStatus.jsx', 'pages/admin/AdminAddCeremony.jsx']) {
    assert.doesNotMatch(read(file), /البروفات/, file);
  }
});

test('the payment page asks for confirmation before sending and offers a copy of the note', () => {
  const page = read('pages/student/ShamCashPayment.jsx');
  const submit = page.slice(page.indexOf('const handleSubmit'), page.indexOf('const doSubmit'));
  assert.match(submit, /setConfirming\(true\)/);
  assert.doesNotMatch(submit, /submitPayment\(/, 'the form only opens the confirmation');
  assert.match(page.slice(page.indexOf('const doSubmit')), /submitPayment\(/);
  assert.match(page, /<PaymentConfirmDialog/);
  assert.match(page, /info\.note_text/);
  const dialog = read('components/PaymentConfirmDialog.jsx');
  assert.match(dialog, /هل أنت متأكد من صحة المعلومات؟/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /useDialogA11y/);
});

test('every graduate page ends with the same footer', () => {
  const footer = read('components/GraduateFooter.jsx');
  assert.match(footer, /HelpFooter/);
  assert.match(footer, /CEREMONY_TITLE/);
  for (const file of ['GraduationFormStep1', 'GraduationFormStep2', 'Login', 'Otp', 'ResetPassword', 'ShamCashPayment', 'OrderStatus', 'OrderRejected', 'MyTicket']) {
    assert.match(read(`pages/student/${file}.jsx`), /<GraduateFooter\b/, file);
  }
});

test('the footer is never inside the sticky bottom bar of the first step', () => {
  const step1 = read('pages/student/GraduationFormStep1.jsx');
  const start = step1.indexOf('className="footer-deck"');
  const deck = step1.slice(start, step1.indexOf('</div>', start));
  assert.ok(start > 0 && deck.includes('submit-btn'));
  assert.ok(!deck.includes('<GraduateFooter'), 'the footer would take half of a short phone screen');
  assert.ok(step1.indexOf('<GraduateFooter') > start);
});
