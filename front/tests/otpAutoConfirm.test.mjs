import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldAskVerification, VERIFICATION_POLL_MS, ADMIN_CONFIRMED_MESSAGE } from '../src/utils/verificationPoll.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('the code page asks only when it can be seen and nothing else is going on', () => {
  const base = { hasToken: true, visible: true, status: 'idle', resetMode: false };
  assert.equal(shouldAskVerification(base), true);
  assert.equal(shouldAskVerification({ ...base, status: 'error' }), true, 'after a wrong code he still waits for the admin');
  assert.equal(shouldAskVerification({ ...base, visible: false }), false);
  assert.equal(shouldAskVerification({ ...base, hasToken: false }), false);
  assert.equal(shouldAskVerification({ ...base, resetMode: true }), false, 'the password reset has no e-mail to wait for');
  assert.equal(shouldAskVerification({ ...base, status: 'verifying' }), false);
  assert.equal(shouldAskVerification({ ...base, status: 'success' }), false);
  assert.ok(VERIFICATION_POLL_MS >= 3000 && VERIFICATION_POLL_MS <= 15000);
  assert.ok(ADMIN_CONFIRMED_MESSAGE.includes('تم تأكيد'));
});

test('the code page takes the session the server gives and moves on, and stops asking when it leaves', () => {
  const page = read('pages/student/Otp.jsx');
  assert.ok(page.includes('getVerificationStatus(verificationToken)'));
  assert.ok(page.includes('result?.verified'));
  assert.ok(page.includes("setGraduateSession({ accessToken: result.access_token, expiresIn: result.expires_in })"));
  assert.ok(page.includes("addEventListener('visibilitychange', ask)") && page.includes("removeEventListener('visibilitychange', ask)"));
  assert.ok(page.includes('clearInterval(timer)'));
  assert.match(read('api/graduate.js'), /\/api\/auth\/verification-status/);
});
