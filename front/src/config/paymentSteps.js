// The four steps of the payment, written once: the payment guide and the payment page show these same
// words (the page puts them above the fields they concern).
import { PAYMENT_NOTE_TEXT } from './graduateTexts.js';

export const PAYMENT_STEPS = [
  'امسح رمز QR أو انسخ رقم حساب شام كاش من صفحة الدفع.',
  'اكتب المبلغ المطلوب كما يظهر في الصفحة.',
  PAYMENT_NOTE_TEXT,
  'عُد إلى الصفحة وأدخل: رقم العملية، والمبلغ المحوّل، واسم المرسل كما يظهر في إشعار التحويل.',
];
