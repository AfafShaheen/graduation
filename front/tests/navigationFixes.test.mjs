import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('every graduate page with a session has a sign-out button that clears the session', () => {
  const header = read('components/StageHeader.jsx');
  assert.ok(header.includes('hasGraduateSession() && ('), 'only shown to a signed-in graduate');
  assert.ok(header.includes('onClick={signOut}'));
  assert.match(header, /logoutGraduate\(getGraduateToken\(\)\)/);
  assert.match(header, /catch \{[\s\S]*?\}\s*clearGraduateSession\(\);/, 'the session goes even when the server is unreachable');
  assert.ok(header.includes("navigate('/login', { replace: true })"));
});

test('a signed-in graduate never sees the registration again', () => {
  const app = read('App.jsx');
  const root = app.slice(app.indexOf('path="/"'), app.indexOf('path="/register"'));
  const register = app.slice(app.indexOf('path="/register"'), app.indexOf('path="/otp"'));
  for (const block of [root, register]) {
    assert.ok(block.includes('hasValidGraduate && !PREVIEW'));
    assert.ok(block.includes('<Navigate to="/tickets" replace />'));
  }
});

test('the package page goes back to the payment only when a package was already chosen', () => {
  const page = read('pages/student/SelectTicket.jsx');
  assert.ok(page.includes('const canGoBack = data?.selected_companions_count != null'));
  assert.ok(page.includes("onBack={canGoBack ? () => navigate('/payment') : undefined}"));
  assert.ok(!read('App.jsx').includes('<SelectTicket onBack'), 'no arrow to the login page any more');
});

test('a network problem on the ticket call offers a retry; only a bad session goes to the login', () => {
  const guard = read('components/TicketGuard.jsx');
  assert.ok(guard.includes('error.status === 401 || error.status === 403'));
  assert.ok(guard.includes('<LoadError onRetry={reload}'));
  const view = read('components/LoadError.jsx');
  assert.ok(view.includes('إعادة المحاولة') && view.includes('role="alert"'));
});

test('an unknown address shows a not-found page with a way back', () => {
  const app = read('App.jsx');
  assert.ok(app.includes('<Route path="*" element={<NotFound />} />'));
  const page = read('pages/NotFound.jsx');
  assert.ok(page.includes('الصفحة غير موجودة') && page.includes("navigate('/', { replace: true })"));
});
