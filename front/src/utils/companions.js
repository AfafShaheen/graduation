/* اسم باقة التذكرة حسب عدد المرافقين (الباقات صارت ديناميكية لكل حفل). */
export function companionsLabel(n) {
  const count = Number(n);
  if (!Number.isFinite(count) || count < 0) return '—';
  if (count === 0) return 'خريج فقط';
  if (count === 1) return 'خريج + مرافق واحد';
  if (count === 2) return 'خريج + مرافقان';
  if (count <= 10) return `خريج + ${count} مرافقين`;
  return `خريج + ${count} مرافقاً`;
}
