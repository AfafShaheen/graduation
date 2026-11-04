// Static guards for fix/admin-polish-2 (B1.2): the roster UI must not mention
// the removed "uploaded file" filter/column/drawer line any more, while the
// college filter and the college column must stay in place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ROSTER_UI_FILES = [
  '../src/pages/admin/roster/RosterFilters.jsx',
  '../src/pages/admin/roster/RosterTable.jsx',
  '../src/pages/admin/roster/RosterDrawer.jsx',
  '../src/pages/admin/roster/RosterTab.jsx',
  '../src/utils/roster.js',
];

test('no roster UI file mentions fileId, file_name or الملف المرفوع', () => {
  ROSTER_UI_FILES.forEach((rel) => {
    const src = read(rel);
    assert.ok(!src.includes('fileId'), `${rel} must not reference fileId`);
    assert.ok(!src.includes('file_id'), `${rel} must not reference file_id`);
    assert.ok(!src.includes('file_name'), `${rel} must not reference file_name`);
    assert.ok(!src.includes('الملف المرفوع'), `${rel} must not render the uploaded-file filter`);
    assert.ok(!src.includes('listUniversityFiles'), `${rel} must not load university files`);
  });
});

test('the college filter and the college column are still there', () => {
  const filters = read('../src/pages/admin/roster/RosterFilters.jsx');
  assert.ok(filters.includes('الكلية'), 'college filter label must stay');
  assert.ok(filters.includes('collegeId'), 'college filter field must stay');
  const table = read('../src/pages/admin/roster/RosterTable.jsx');
  assert.ok(table.includes("case 'college'"), 'college column must stay');
  assert.ok(read('../src/utils/rosterView.js').includes("label: 'الكلية والتخصص'"), 'college column label must stay');
  const utils = read('../src/utils/roster.js');
  assert.ok(utils.includes("collegeId: 'college_id'"), 'college query key must stay');
});

test('the roster columns are chosen by the admin and there is no file column', () => {
  const table = read('../src/pages/admin/roster/RosterTable.jsx');
  const view = read('../src/utils/rosterView.js');
  assert.ok(table.includes('{c.label}'), 'headers come from the column list');
  assert.ok(table.includes('colSpan={span}'), 'empty-state colSpan must follow the visible columns');
  assert.ok(!view.includes('file') && !view.includes('الملف'), 'no file column');
});
