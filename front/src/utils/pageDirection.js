// Which way a graduate page moves when it opens: forward (the next stage), back (an earlier
// stage) or a plain fade. Admin and scanner screens do not animate at all.

// The order of the graduate journey. Pages with the same rank only fade into each other.
const RANK = {
  '/guide/start': 0,
  '/': 1,
  '/register': 2,
  '/otp': 3,
  '/questions': 4,
  '/tickets': 5,
  '/payment': 6,
  '/payment-submitted': 7,
  '/payment-rejected': 7,
  '/my-ticket': 8,
};

const FADE_ONLY = ['/login', '/reset-otp', '/reset-password', '/guide'];

export function isGraduatePath(path) {
  if (!path) return false;
  if (path in RANK) return true;
  return FADE_ONLY.some((p) => path === p || path.startsWith(`${p}/`));
}

// from: the previous path (null on the first load). Returns 'forward' | 'back' | 'fade' | 'none'.
export function transitionDirection(from, to) {
  if (!isGraduatePath(to)) return 'none';
  if (from == null || from === to) return 'fade';
  const a = RANK[from];
  const b = RANK[to];
  if (a === undefined || b === undefined || a === b) return 'fade';
  return b > a ? 'forward' : 'back';
}
