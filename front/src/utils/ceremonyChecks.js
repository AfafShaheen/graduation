// The checks of the ceremony form, the same rules the server applies (so the admin sees the reason
// under the field before anything is sent).
export const NAME_BLANK = 'اسم الحفل مطلوب ولا يكفي أن يكون مسافات.';
export const WHATSAPP_REQUIRED = 'رابط مجموعة واتساب مطلوب.';
export const WHATSAPP_INVALID = 'رابط مجموعة واتساب غير صالح: يجب أن يبدأ بـ https:// وأن يكون رابطاً كاملاً بلا مسافات.';

export function cleanCeremonyName(value) {
  return String(value ?? '').split(/\s+/).filter(Boolean).join(' ');
}

export function isValidWhatsappLink(value) {
  const link = String(value ?? '').trim();
  if (!link || link.length > 500 || /\s/.test(link)) return false;
  try {
    const url = new URL(link);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

// { name?, whatsapp_group_link? } with a message for each wrong field
export function ceremonyFieldErrors({ name, whatsappLink }) {
  const errors = {};
  if (cleanCeremonyName(name).length < 2) errors.name = NAME_BLANK;
  if (!String(whatsappLink ?? '').trim()) errors.whatsapp_group_link = WHATSAPP_REQUIRED;
  else if (!isValidWhatsappLink(whatsappLink)) errors.whatsapp_group_link = WHATSAPP_INVALID;
  return errors;
}
