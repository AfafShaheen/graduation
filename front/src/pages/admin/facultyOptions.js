/*
 * خيارات الكليات المقترحة.
 *
 * القرار D10: الكليات ليست قائمة ثابتة — هذه المجموعة اقتراحات فقط،
 * ويستطيع المدير إضافة أي اسم كلية آخر حرّاً. الخادم يقبل أي أسماء.
 */
export const FACULTY_OPTIONS = [
  { key: 'civil', label: 'الهندسة المدنية' },
  { key: 'mech', label: 'الهندسة الميكانيكية' },
  { key: 'it', label: 'الهندسة المعلوماتية' },
  { key: 'arch', label: 'الهندسة المعمارية' },
  { key: 'science', label: 'العلوم' },
  { key: 'arts', label: 'الآداب' },
];

export function normalizeCollegeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function uniqueCollegeNames(names) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const name = normalizeCollegeName(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

export function selectedKeysFromCollegeNames(names, options = FACULTY_OPTIONS) {
  const selected = new Set(uniqueCollegeNames(names));
  const keys = {};
  for (const option of options) keys[option.key] = selected.has(option.label);
  return keys;
}

export function resolveCollegeNames(
  selectedKeys,
  customNames,
  options = FACULTY_OPTIONS,
) {
  const chosen = options
    .filter((option) => selectedKeys?.[option.key])
    .map((option) => option.label);
  return uniqueCollegeNames([
    ...chosen,
    ...(Array.isArray(customNames) ? customNames : []),
  ]);
}
