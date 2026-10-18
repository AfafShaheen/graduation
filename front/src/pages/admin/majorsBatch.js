const COLLEGE_SEPARATORS = [':', '\uFF1A'];
const MAJOR_SEPARATORS = /[,،;؛|\t]+/;

export function normalizeMajorName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeCollegeKey(value) {
  return normalizeMajorName(value)
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

export function parseMajorsBatch(text) {
  const groups = [];
  const problems = [];
  const byKey = new Map();
  let lastGroup = null;

  String(text ?? '')
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;

      const positions = COLLEGE_SEPARATORS.map((sep) => line.indexOf(sep)).filter((at) => at >= 0);
      const separatorAt = positions.length ? Math.min(...positions) : -1;

      let collegeName;
      let majorsText;
      if (separatorAt < 0) {
        if (lastGroup) {
          collegeName = lastGroup.collegeName;
          majorsText = line;
        } else {
          collegeName = '';
          majorsText = line;
        }
      } else {
        collegeName = normalizeMajorName(line.slice(0, separatorAt));
        majorsText = line.slice(separatorAt + 1);
      }

      const key = normalizeCollegeKey(collegeName);
      let group = byKey.get(key);
      if (!group) {
        group = { collegeName, majors: [] };
        byKey.set(key, group);
        groups.push(group);
      }

      majorsText
        .split(MAJOR_SEPARATORS)
        .map(normalizeMajorName)
        .filter(Boolean)
        .forEach((name) => {
          if (name.length < 2) {
            problems.push(`السطر ${index + 1}: اسم تخصص قصير «${name}».`);
            return;
          }
          if (!group.majors.includes(name)) group.majors.push(name);
        });

      lastGroup = group;
    });

  return { groups, problems };
}

export function resolveBatchGroups(groups, colleges, fallbackCollegeId) {
  const list = Array.isArray(colleges) ? colleges : [];
  const index = new Map();
  list.forEach((college) => {
    if (college && college.id != null) index.set(normalizeCollegeKey(college.name), college);
  });

  const matched = [];
  const unmatched = [];

  (Array.isArray(groups) ? groups : []).forEach((group) => {
    const key = normalizeCollegeKey(group.collegeName);
    if (group.collegeName === '' && fallbackCollegeId != null) {
      matched.push({ collegeId: fallbackCollegeId, collegeName: group.collegeName, majors: group.majors });
      return;
    }
    const college = index.get(key);
    if (college) matched.push({ collegeId: college.id, collegeName: college.name, majors: group.majors });
    else unmatched.push(group.collegeName);
  });

  return { matched, unmatched };
}

export default parseMajorsBatch;
