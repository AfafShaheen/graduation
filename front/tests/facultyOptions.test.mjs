import test from "node:test";
import assert from "node:assert/strict";
import {
  FACULTY_OPTIONS,
  normalizeCollegeName,
  resolveCollegeNames,
  selectedKeysFromCollegeNames,
  uniqueCollegeNames,
} from "../src/pages/admin/facultyOptions.js";

test("uniqueCollegeNames trims and drops duplicates and empties", () => {
  assert.deepEqual(uniqueCollegeNames(['  العلوم ', 'العلوم', '', null, 'الآداب']), [
    'العلوم',
    'الآداب',
  ]);
});

test('normalizeCollegeName ignores non-strings', () => {
  assert.equal(normalizeCollegeName('  طب  '), 'طب');
  assert.equal(normalizeCollegeName(undefined), '');
  assert.equal(normalizeCollegeName(42), '');
});

test('selectedKeysFromCollegeNames maps only known labels', () => {
  const keys = selectedKeysFromCollegeNames(['الهندسة المدنية', 'كلية غير معروفة']);
  assert.equal(keys.civil, true);
  assert.equal(keys.mech, false);
  assert.equal(Object.keys(keys).length, FACULTY_OPTIONS.length);
});

test('resolveCollegeNames merges selected keys with custom names without duplicates', () => {
  const keys = selectedKeysFromCollegeNames(['العلوم']);
  assert.deepEqual(resolveCollegeNames(keys, ['كلية جديدة', 'العلوم']), [
    'العلوم',
    'كلية جديدة',
  ]);
});
