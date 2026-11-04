import { whatsappHref } from '../components/helpFooterLogic.js';

// The payment form starts with what the system already knows, so the graduate only has to
// type what only he can read in the Sham Cash app: the transaction number.

// "محمد الشامي 9000001" -> "محمد الشامي" (the note text is name + university id)
export function senderNameFromNote(noteText) {
  return String(noteText || '').trim().replace(/\s+\S+$/, '');
}

// The amount is the price of the chosen package, as digits only ("50" for "50.00").
export function amountDigits(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : '';
}

// Fills only the fields that are still empty, so nothing he typed is overwritten.
export function prefillPaymentForm(form, info) {
  if (!info) return form;
  return {
    ...form,
    transferAmount: form.transferAmount || amountDigits(info.amount),
    senderName: form.senderName || senderNameFromNote(info.note_text),
  };
}

export const PAYMENT_HELP_MESSAGE = 'مرحباً، أحتاج مساعدة في الدفع عبر شام كاش.';

// WhatsApp link asking for help with the payment, written with the graduate's name and number.
export function paymentHelpHref(phone, noteText) {
  const base = whatsappHref(phone);
  if (!base) return null;
  const name = senderNameFromNote(noteText);
  const id = String(noteText || '').trim().split(/\s+/).pop();
  const who = name && id ? `أنا ${name}، رقمي الجامعي ${id}. ` : '';
  return `${base}?text=${encodeURIComponent(`مرحباً، ${who}أحتاج مساعدة في الدفع عبر شام كاش.`)}`;
}
