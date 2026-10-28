/* أدوات الدفع — دوال نقية بلا React (B4.1) */

const TX_ALLOWED = /^[A-Za-z0-9-]{4,100}$/;

/**
 * التحقق من رقم العملية (transaction number) كما كتبه الخريج.
 * القاعدة (D4): يُقبل فقط trim للحواف، وتبقى حالة الأحرف كما هي.
 * الحروف المسموحة: A-Z a-z 0-9 وشرطة، من 4 إلى 100 خانة.
 * @param {string} value
 * @returns {string} نص الخطأ بالعربية، أو '' إذا القيمة صالحة
 */
export function validateTransactionId(value) {
  const t = String(value ?? '').trim();
  if (!t) return 'يرجى إدخال رقم العملية';
  if (t.length < 4) return 'رقم العملية قصير جداً (4 خانات على الأقل)';
  if (t.length > 100 || !TX_ALLOWED.test(t)) {
    return 'رقم العملية يقبل أحرفاً وأرقاماً إنجليزية وشرطة فقط، بدون مسافات';
  }
  return '';
}
