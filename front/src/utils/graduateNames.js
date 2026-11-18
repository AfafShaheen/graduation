// The three names of a graduate in the admin's name edit (the mother's name is no longer used).

const ARABIC_NAME = /^[ء-غف-ي ]{2,100}$/;
const DIACRITICS_AND_TATWEEL = /[ؗ-ًؚ-ْٰـ]/g;

// what the server will store: no diacritics or tatweel, one space between words
export function tidyName(value) {
  return String(value ?? '').replace(DIACRITICS_AND_TATWEEL, '').replace(/\s+/g, ' ').trim();
}

// The names to start the form with: the account's own, or the full name split in two.
export function namesOf(detail, row) {
  const [firstFromRow = '', ...rest] = String(row?.full_name || '').trim().split(/\s+/);
  return {
    firstName: detail?.first_name || firstFromRow,
    lastName: detail?.last_name || rest.join(' '),
    fatherName: detail?.father_name || '',
  };
}

// '' when the three names can be sent; otherwise the sentence to show
export function nameDraftError(draft) {
  const labels = { firstName: 'الاسم', lastName: 'الكنية', fatherName: 'اسم الأب' };
  for (const [key, label] of Object.entries(labels)) {
    if (!ARABIC_NAME.test(tidyName(draft[key]))) {
      return `${label}: حروف عربية ومسافات فقط، وحرفان على الأقل.`;
    }
  }
  return '';
}
