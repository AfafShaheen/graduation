/*
  العدّاد الموحّد لطلبات الدفع بانتظار المراجعة (كل الحفلات).

  المصدر الوحيد: GET /api/admin/stats/v2 بدون event_id → attention.processing
  (تذاكر حالة PROCESSING لحسابات مؤكَّدة في كل الحفلات؛ الكاش على الخادم 30 ثانية
  ويُمسح بعد كل إجراء إداري، لذا الأرقام في الشريط الجانبي وصفحة طلبات الدفع متطابقة دائماً).

  لا نقرأ من إحصائيات الإدارة القديمة إطلاقاً — كانت تخلط الأرقام عبر الحفلات بلا فلتر تحقق.
*/

import { adminRequest } from '../api/admin.js';

// فترة التحديث: 30 ثانية (نفس عمر كاش الإحصائيات على الخادم) — أكبر من الحد الأدنى 20 ثانية.
export const PENDING_PAYMENTS_POLL_MS = 30000;

// استخراج الرقم من رد stats/v2 بأمان (0 عند أي نقص).
export function readAttentionProcessing(data) {
  const n = Number(data && data.attention ? data.attention.processing : 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// قراءة العدّاد الكلي من نقطة النهاية الموحّدة.
export async function fetchPendingPaymentsTotal() {
  const data = await adminRequest("/api/admin/stats/v2");
  return readAttentionProcessing(data);
}
