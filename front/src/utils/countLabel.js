// Arabic number agreement: 1 → one form, 2 → dual, 3-10 → plural, 11+ → singular accusative.
export function countLabel(n, one, two, few, many) {
  const count = Number(n) || 0;
  if (count === 0) return `لا ${few}`;
  if (count === 1) return `${one} واحد`;
  if (count === 2) return two;
  return count <= 10 ? `${count} ${few}` : `${count} ${many}`;
}
