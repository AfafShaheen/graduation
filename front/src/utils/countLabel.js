// Arabic number agreement: 1 → one form, 2 → dual, 3-10 → plural, 11+ → singular accusative.
// oneWord is the "one" of the noun's gender: واحد (masculine) or واحدة (feminine)
export function countLabel(n, one, two, few, many, oneWord = 'واحد') {
  const count = Number(n) || 0;
  if (count === 0) return `لا ${few}`;
  if (count === 1) return `${one} ${oneWord}`;
  if (count === 2) return two;
  return count <= 10 ? `${count} ${few}` : `${count} ${many}`;
}
