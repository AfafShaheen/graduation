import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('a failed file says why, in the answer and later in the list', () => {
  const page = read('pages/admin/AdminUniversityFiles.jsx');
  assert.ok(page.includes('function UploadErrorsTable'));
  assert.equal((page.match(/<UploadErrorsTable/g) || []).length, 2, 'the answer of the upload and the list');
  assert.ok(page.includes("f.status === 'failed'") && page.includes('لم يُستورد شيء'));
  assert.ok(page.includes('عرض الأخطاء ('));
  assert.ok(page.includes('downloadErrorsCsv(f.errors)'), 'the errors of a listed file can be downloaded too');
});

test('"added 0" never comes alone: the rows left alone because the graduates registered are said', () => {
  const page = read('pages/admin/AdminUniversityFiles.jsx');
  assert.ok(page.includes('registered: imp.skipped_registered ?? 0'));
  assert.ok(page.includes('لم يُضَف ولم يُحدَّث أي سجل من أصل'));
  assert.ok(page.includes('rows_skipped_registered'));
  assert.ok(page.includes('سجّلوا بالفعل'));
});
