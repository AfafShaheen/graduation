export const TOP_STUDENT_TITLE = 'من الأوائل';

const RANK_LABELS = {
  1: 'الأول',
  2: 'الثاني',
  3: 'الثالث',
};

export function topRankLabel(rank) {
  const key = Number(rank);
  if (!Number.isInteger(key)) return null;
  return RANK_LABELS[key] || null;
}

export default topRankLabel;
