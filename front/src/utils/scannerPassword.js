// A password the admin can read to a volunteer and the volunteer can type: no look-alike characters
// (0/O, 1/l/I), letters and digits both, 10 characters. The server checks the policy again.
const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';

function pick(chars, random) {
  return chars[Math.floor(random() * chars.length)];
}

export function generateScannerPassword(random = Math.random, length = 10) {
  const chars = [];
  for (let i = 0; i < length - 3; i += 1) chars.push(pick(LETTERS, random));
  for (let i = 0; i < 3; i += 1) chars.push(pick(DIGITS, random));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// The words next to a password: shown, or "reset to get one" for an account made before copies were kept
export const NO_PASSWORD_TEXT = 'غير معروفة (حساب قديم): أعد تعيينها لتظهر';
