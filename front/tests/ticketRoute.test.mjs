import test from 'node:test';
import assert from 'node:assert/strict';
import { routeForTicket, ORDER_POLL_MS } from '../src/utils/ticketRoute.js';

const withStatus = (status) => ({ has_ticket: true, ticket: { status } });

test('every ticket status leads to its own page', () => {
  assert.equal(routeForTicket(null), '/tickets');
  assert.equal(routeForTicket({ has_ticket: false }), '/tickets');
  assert.equal(routeForTicket(withStatus('AWAITING_PAYMENT')), '/payment');
  assert.equal(routeForTicket(withStatus('PROCESSING')), '/payment-submitted');
  assert.equal(routeForTicket(withStatus('REJECTED')), '/payment-rejected');
  assert.equal(routeForTicket(withStatus('CONFIRMED')), '/my-ticket');
  assert.equal(routeForTicket(withStatus('SOMETHING_ELSE')), '/tickets');
});

test('approval moves the waiting page to the ticket automatically', () => {
  // OrderStatus lives on /payment-submitted and leaves it for any other target
  const waiting = routeForTicket(withStatus('PROCESSING'));
  assert.equal(waiting, '/payment-submitted');
  assert.notEqual(routeForTicket(withStatus('CONFIRMED')), waiting);
  assert.notEqual(routeForTicket(withStatus('REJECTED')), waiting);
});

test('the waiting page checks often enough but not too often', () => {
  assert.ok(ORDER_POLL_MS >= 5000 && ORDER_POLL_MS <= 60000);
});
