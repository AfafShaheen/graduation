// Shared cleaner for server-side validation messages coming from FastAPI/Pydantic.
//
// Pydantic v2 wraps `ValueError` messages raised in validators with a prefix:
//   "Value error, <message>"  or  "Value error، <message>" (Arabic comma).
// Built-in constraint failures (Field required, min_length, ...) arrive in English.
// This helper strips the prefix and guarantees the result is Arabic-facing: if the
// cleaned message contains no Arabic letters, a generic Arabic fallback is used so
// an English string never reaches the user.
export const PYDANTIC_PREFIX_RE = /^Value error[,،\u060C]?\s*/i;

const ARABIC_LETTER_RE = /[\u0600-\u06FF]/;

export function cleanServerMessage(msg) {
  if (msg == null) return '';
  const cleaned = String(msg).trim().replace(PYDANTIC_PREFIX_RE, '').trim();
  if (!cleaned) return '';
  if (!ARABIC_LETTER_RE.test(cleaned)) {
    return 'قيمة غير صالحة';
  }
  return cleaned;
}

export default cleanServerMessage;
