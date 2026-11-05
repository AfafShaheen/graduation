// The short manual code under every QR code: two letters and seven digits (e.g. KM4829173).
// The server is the judge; this only tidies what is typed and how it is shown.

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const SHAPE = /^[A-Z]{2}[0-9]{7}$/;

// "km-482 9173" or Arabic digits -> "KM4829173"; null when it is not shaped like a short code
export function normalizeShortCode(raw) {
  const digits = String(raw ?? '').replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_DIGITS.indexOf(d);
    return String(i >= 0 ? i : EASTERN_DIGITS.indexOf(d));
  });
  // upper-cased by hand: the project bans the built-in call so a transaction number is never changed by accident
  const text = digits
    .replace(/[\s\-_]/g, '')
    .replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32));
  return SHAPE.test(text) ? text : null;
}

// "KM4829173" -> "KM 4829173" (easier to read aloud and to type)
export function formatShortCode(code) {
  const text = String(code ?? '');
  return SHAPE.test(text) ? `${text.slice(0, 2)} ${text.slice(2)}` : text;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// what the scanner may send: the full UUID of a QR or a short code; null when it is neither
export function scannableCode(raw) {
  const text = String(raw ?? '').trim();
  if (UUID.test(text)) return text;
  return normalizeShortCode(text);
}
