// Digits typed on an Arabic keypad (٠-٩ and ۰-۹) become 0-9, so a number is the same number
// whichever keyboard it was typed on.
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN = '۰۱۲۳۴۵۶۷۸۹';

export function toLatinDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : EASTERN.indexOf(d));
  });
}
