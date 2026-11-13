import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('a ceremony takes several data files, chosen from a drop-down', () => {
  const form = read('pages/admin/AdminAddCeremony.jsx');
  assert.ok(form.includes('const [selectedFileIds, setSelectedFileIds] = useState([])'));
  assert.ok(!form.includes('type="checkbox"'), 'no list of every file on the page');
  assert.ok(form.includes('aria-label="إضافة ملف بيانات"') && form.includes('availableFiles.map'));
  assert.ok(form.includes('dataFiles.length > 6'), 'a search box appears when there are many files');
  assert.ok(!form.includes('selectedFileId,') && !form.includes('setSelectedFileId('), 'the single-file state is gone');
  assert.ok(!form.includes('add-cer-select"\n                value={selectedFileId}'));
});

test('every ticked file is linked on its own after the ceremony is created, and a failure keeps the page', () => {
  const form = read('pages/admin/AdminAddCeremony.jsx');
  assert.ok(form.includes('for (const fileId of selectedFileIds)'));
  assert.ok(form.includes('linkSelectedFile(fileId, id, { skipConfirm: true })'));
  assert.ok(form.includes('failedFiles > 0') && form.includes('setCreatedEventId(id)'));
  // the page can never save the ceremony twice, and the guard comes after preventDefault
  const handler = form.slice(form.indexOf('const handleSubmit = async (e) => {'));
  assert.ok(handler.indexOf('e.preventDefault()') < handler.indexOf('createdEventId != null'));
});

test('each file shows its own result and its own errors', () => {
  const form = read('pages/admin/AdminAddCeremony.jsx');
  assert.ok(form.includes('fileResults[id]'));
  assert.ok(form.includes('<UploadErrorsTable errors={result.errors}'));
  assert.ok(form.includes('عرض الأخطاء ('));
  assert.ok(!form.includes('const [linkErrors'), 'no shared error list for all files');
});

test('files already linked to the ceremony cannot be removed, files of another ceremony are marked', () => {
  const form = read('pages/admin/AdminAddCeremony.jsx');
  assert.ok(form.includes('disabled={linkBusy || linkedHere || createdEventId != null}'));
  assert.ok(form.includes("' · مرتبط بحفل آخر'") && form.includes("' · مرتبط بهذا الحفل'"));
  assert.ok(form.includes('onClick={() => handleFileToggle(id, false)}'));
  assert.ok(form.includes('confirmReassign(file)'));
});

test('the table of upload errors is one shared component', () => {
  assert.ok(fs.existsSync(new URL('../src/components/UploadErrorsTable.jsx', import.meta.url)));
  assert.ok(read('pages/admin/AdminUniversityFiles.jsx').includes("import UploadErrorsTable from '../../components/UploadErrorsTable'"));
  assert.ok(!read('pages/admin/AdminUniversityFiles.jsx').includes('function UploadErrorsTable'));
});
