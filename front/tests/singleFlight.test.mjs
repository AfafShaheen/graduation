import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlight, reuseFreshToken } from '../src/utils/singleFlight.js';

const tick = () => new Promise((r) => setTimeout(r, 5));

test('parallel callers share one job (one refresh, not five)', async () => {
  const flights = createSingleFlight();
  let runs = 0;
  const job = async () => {
    runs += 1;
    await tick();
    return 'token-' + runs;
  };
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => flights.run('admin', job)));
  assert.equal(runs, 1);
  assert.deepEqual(new Set(results), new Set(['token-1']));
});

test('different keys do not wait for each other', async () => {
  const flights = createSingleFlight();
  let runs = 0;
  const job = async () => { runs += 1; await tick(); };
  await Promise.all([flights.run('admin', job), flights.run('scanner', job), flights.run('graduate', job)]);
  assert.equal(runs, 3);
});

test('a finished job does not block the next one', async () => {
  const flights = createSingleFlight();
  let runs = 0;
  const job = async () => { runs += 1; return runs; };
  assert.equal(await flights.run('admin', job), 1);
  assert.equal(await flights.run('admin', job), 2);
});

test('a failing job fails every waiting caller and then clears', async () => {
  const flights = createSingleFlight();
  let runs = 0;
  const bad = async () => { runs += 1; await tick(); throw new Error('network'); };
  const outcomes = await Promise.allSettled([flights.run('admin', bad), flights.run('admin', bad)]);
  assert.equal(runs, 1);
  assert.deepEqual(outcomes.map((o) => o.status), ['rejected', 'rejected']);
  const ok = await flights.run('admin', async () => 'again');
  assert.equal(ok, 'again');
});

test('another tab already refreshed: reuse its fresh token', () => {
  assert.equal(reuseFreshToken('new', 'old', false), 'new');
  assert.equal(reuseFreshToken('old', 'old', false), null); // same token: we must refresh
  assert.equal(reuseFreshToken('new', 'old', true), null); // stored one is expired too
  assert.equal(reuseFreshToken(null, 'old', false), null);
});
