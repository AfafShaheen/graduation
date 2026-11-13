// The code page asks the server every few seconds whether the e-mail was confirmed meanwhile
// (an admin can confirm it), so the graduate moves on without typing a code.
export const VERIFICATION_POLL_MS = 5000;
export const ADMIN_CONFIRMED_MESSAGE = 'تم تأكيد بريدك الإلكتروني. جارٍ المتابعة...';

// 'ask' only while the page can be seen, nothing is being checked or finished, and a token exists
export function shouldAskVerification({ hasToken, visible, status, resetMode }) {
  if (resetMode || !hasToken || !visible) return false;
  return status !== 'verifying' && status !== 'success';
}
