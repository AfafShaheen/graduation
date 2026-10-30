import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal in-memory Storage; session.js reads the globals at call time.
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}
function freshBrowser() {
  globalThis.localStorage = makeStorage();
  globalThis.sessionStorage = makeStorage();
}

freshBrowser();
const s = await import('../src/api/session.js');

test('login sessions live in localStorage so they survive closing the tab', () => {
  freshBrowser();
  s.setAdminSession({ accessToken: 'a1', expiresIn: 7200, refreshToken: 'r1', refreshExpiresIn: 86400 * 30 });
  assert.ok(localStorage.keys().includes('admin_access_token'));
  assert.ok(localStorage.keys().includes('admin_refresh_token'));
  assert.equal(sessionStorage.keys().length, 0);
  // a new tab: same localStorage, empty sessionStorage
  globalThis.sessionStorage = makeStorage();
  assert.equal(s.getAdminToken(), 'a1');
  assert.equal(s.hasAdminSession(), true);
});

test('an expired access token with a valid refresh token is still a usable session', () => {
  freshBrowser();
  s.setGraduateSession({ accessToken: 'g1', expiresIn: -10, refreshToken: 'gr1', refreshExpiresIn: 86400 * 7 });
  assert.equal(s.isGraduateTokenExpired(), true); // the short token is over...
  assert.equal(s.hasGraduateSession(), true); // ...but the session can be renewed
});

test('the session ends when the refresh token has expired or is missing', () => {
  freshBrowser();
  s.setScannerSession({ accessToken: 's1', expiresIn: -10, event: { id: 1 }, refreshToken: 'sr1', refreshExpiresIn: -5 });
  assert.equal(s.hasScannerSession(), false);

  freshBrowser();
  s.setScannerSession({ accessToken: 's1', expiresIn: -10, event: { id: 1 } });
  assert.equal(s.hasScannerSession(), false);

  freshBrowser();
  assert.equal(s.hasScannerSession(), false);
  assert.equal(s.hasAdminSession(), false);
  assert.equal(s.hasGraduateSession(), false);
});

test('a valid access token is enough even without a refresh token', () => {
  freshBrowser();
  s.setAdminSession({ accessToken: 'a1', expiresIn: 600 });
  assert.equal(s.hasAdminSession(), true);
});

test('a session saved by the older build (sessionStorage) is still understood and cleared', () => {
  freshBrowser();
  sessionStorage.setItem('admin_access_token', 'old');
  sessionStorage.setItem('admin_expires_at', String(Date.now() + 60000));
  assert.equal(s.getAdminToken(), 'old');
  assert.equal(s.hasAdminSession(), true);
  s.clearAdminSession();
  assert.equal(s.getAdminToken(), null);
  assert.equal(sessionStorage.getItem('admin_access_token'), null);
});

test('logging out removes every session key from both storages', () => {
  freshBrowser();
  s.setGraduateSession({ accessToken: 'g', expiresIn: 600, refreshToken: 'r', refreshExpiresIn: 600 });
  s.clearGraduateSession();
  assert.equal(localStorage.keys().filter((k) => k.includes('access') || k.includes('refresh')).length, 0);
  assert.equal(s.hasGraduateSession(), false);
});

test('short registration steps stay in sessionStorage (not kept after the tab closes)', () => {
  freshBrowser();
  s.setRegistrationToken('reg-token', 900);
  assert.ok(sessionStorage.keys().includes('registration_token'));
  assert.equal(localStorage.keys().includes('registration_token'), false);
});
