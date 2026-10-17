/* أدوات المبالغ: تحويل أرقام عربية/فارسية إلى إنجليزية وتحليل المبالغ دون تغيير قيمتها.
   مهم: لا نُزيل الفاصلة العشرية، حتى لا يتحول "100000.00" إلى "10000000" (خطأ ×100). */
const ARABIC = /[\u0660-\u0669]/g;
const PERSIAN = /[\u06F0-\u06F9]/g;

export function normalizeDigits(value) {
  return String(value ?? "")
    .replace(ARABIC, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
    .replace(PERSIAN, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48));
}

/* يحلّل مبلغاً نصياً (قد يكون Decimal بصيغة "100000.00") إلى رقم صحيح القيمة. */
export function parseAmount(value) {
  if (value == null) return 0;
  const cleaned = normalizeDigits(value)
    .replace(/\u066B/g, ".")
    .replace(/\u066C/g, "")
    .replace(/[,\s]/g, "")
    .replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/* نص مناسب لحقل إدخال المبلغ: يحافظ على القيمة (ويسقط الأصفار العشرية الزائدة). */
export function formatAmount(value) {
  const n = parseAmount(value);
  return n === 0 ? "" : String(n);
}

export default parseAmount;
