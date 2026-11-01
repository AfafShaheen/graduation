import { HELP_QUESTION, HELP_EMERGENCY_LABEL } from "../config/brand.js";

/**
 * helpLines (D8) — منطق سطري تذييل المساعدة كدالة نقية:
 * السطر الأول: HELP_QUESTION دائماً.
 * السطر الثاني: HELP_EMERGENCY_LABEL + رقم الهاتف فقط عند وجود رقم غير فارغ.
 * منفصلة في ملف خاص حتى يبقى ملف المكوّن مخصصاً للتصدير الواحد (fast refresh).
 */
export function helpLines(question, label, phone) {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  return {
    line1: question,
    line2: trimmed ? { label, phone: trimmed } : null,
  };
}

export function whatsappHref(phone) {
  const digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  if (!digits) return null;
  const internationalNumber = digits.startsWith("0") ? `963${digits.slice(1)}` : digits;
  return `https://wa.me/${internationalNumber}`;
}

export { HELP_QUESTION, HELP_EMERGENCY_LABEL };
