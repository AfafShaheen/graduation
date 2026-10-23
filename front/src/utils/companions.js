export function companionsLabel(n) {
  const count = Number(n);
  if (count === 2) return 'خريج + مرافقان';
  if (count >= 3 && count <= 10) return `خريج + ${count} مرافقين`;
  return `خريج + ${count} مرافق`;
}
