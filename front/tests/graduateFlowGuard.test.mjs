import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Keeps BOTH sets of work alive in the three graduate files that two people edit:
// the session / brand / help-footer / transaction-number fixes AND the "change
// package before paying" feature. If a later commit drops either, this fails.
const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('TicketGuard keeps the refresh-aware session check and the change-package rule', () => {
  const guard = read('components/TicketGuard.jsx');
  assert.match(guard, /hasGraduateSession/);
  assert.doesNotMatch(guard, /isGraduateTokenExpired/);
  assert.match(guard, /from "\.\.\/utils\/ticketRoute"/);
  assert.doesNotMatch(guard, /export function routeForTicket/);
  assert.match(guard, /canChangePackage/);
  assert.match(guard, /AWAITING_PAYMENT/);
  assert.match(guard, /REJECTED/);
});

test('ShamCashPayment keeps the transaction-number fixes, the brand, the help footer and the change-package button', () => {
  const page = read('pages/student/ShamCashPayment.jsx');
  assert.match(page, /validateTransactionId/);
  assert.match(page, /inputMode="text"/);
  assert.doesNotMatch(page, /toUpperCase/);
  assert.match(page, /CEREMONY_TITLE/);
  assert.match(page, /<HelpFooter/);
  assert.match(page, /navigate\('\/tickets'\)/);
  assert.match(page, /sc-secondary-btn/);
  assert.match(read('style/ShamCashPayment.css'), /sc-secondary-btn/);
});

test('SelectTicket keeps the brand, the help footer and the remembered package', () => {
  const page = read('pages/student/SelectTicket.jsx');
  assert.match(page, /CEREMONY_TITLE/);
  assert.match(page, /<HelpFooter/);
  assert.doesNotMatch(page, /حفل تخرج جامعة حمص/);
  assert.match(page, /selected_companions_count/);
});

test('the waiting page keeps its automatic refresh and the new questions text stays', () => {
  const waiting = read('pages/student/OrderStatus.jsx');
  assert.match(waiting, /ORDER_POLL_MS/);
  assert.match(waiting, /routeForTicket\(data\)/);
  assert.match(read('pages/student/GraduateQuestions.jsx'), /ممثلاً لطلاب دفعتك/);
});
