import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('route guards use the refresh-aware session checks, not the 2-hour access token', () => {
  const app = read('App.jsx');
  assert.doesNotMatch(app, /is(Graduate|Admin|Scanner)TokenExpired/);
  for (const fn of ['hasGraduateSession', 'hasAdminSession', 'hasScannerSession']) {
    assert.match(app, new RegExp(fn));
  }
  assert.doesNotMatch(read('hooks/useMyTicket.js'), /isGraduateTokenExpired/);
  assert.match(read('hooks/useMyTicket.js'), /hasGraduateSession/);
  assert.doesNotMatch(read('pages/scanner/ScannerCamera.jsx'), /isScannerTokenExpired/);
  assert.match(read('pages/scanner/ScannerCamera.jsx'), /hasScannerSession/);
  assert.doesNotMatch(read('components/TicketGuard.jsx'), /isGraduateTokenExpired/);
});

test('the token refresh is serialized and does not end the session on network errors', () => {
  const client = read('api/client.js');
  assert.match(client, /createSingleFlight\(\)/);
  assert.match(client, /navigator\.locks/);
  assert.match(client, /reuseFreshToken\(/);
  // inside performRefresh a failed or timed-out fetch throws instead of returning null
  // (which logs out): it goes through fetchWithTimeout, which throws ApiError(0, ...).
  const refresh = client.slice(client.indexOf('async function performRefresh'));
  assert.match(refresh.slice(0, refresh.indexOf('if (!response.ok)')), /await fetchWithTimeout\(/);
  const helper = client.slice(client.indexOf('async function fetchWithTimeout'), client.indexOf('const refreshFlights'));
  assert.match(helper, /throw new ApiError\(0/);
  assert.match(helper, /AbortController/);
});

test('admin, graduate and scanner tokens are not kept in sessionStorage', () => {
  const lines = read('api/session.js').split('\n');
  const offenders = lines.filter(
    (l) => /sessionStorage\./.test(l) && /(SCANNER_|GRADUATE_ACCESS|GRADUATE_EXPIRES|GRADUATE_REFRESH|ADMIN_)/.test(l) && !l.includes('const persistent'),
  );
  assert.deepEqual(offenders, []);
});

test('the waiting-for-review page refreshes by itself and leaves when the status changes', () => {
  const page = read('pages/student/OrderStatus.jsx');
  assert.match(page, /visibilitychange/);
  assert.match(page, /ORDER_POLL_MS/);
  assert.match(page, /routeForTicket\(data\)/);
  assert.match(page, /navigate\(target, \{ replace: true \}\)/);
  assert.match(read('hooks/useMyTicket.js'), /silent/);
});
