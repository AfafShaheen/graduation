import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMajorsBatch, resolveBatchGroups, normalizeCollegeKey } from '../src/pages/admin/majorsBatch.js';

test('parses colleges with colon and Arabic/other separators', () => {
  const { groups, problems } = parseMajorsBatch(
    [
      'كلية الهندسة المعلوماتية: هندسة البرمجيات، الذكاء الاصطناعي؛ الشبكات',
      'كلية الطب : الطب البشري | طب الأسنان',
    ].join('\n'),
  );
  assert.equal(problems.length, 0);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    collegeName: 'كلية الهندسة المعلوماتية',
    majors: ['هندسة البرمجيات', 'الذكاء الاصطناعي', 'الشبكات'],
  });
  assert.deepEqual(groups[1].majors, ['الطب البشري', 'طب الأسنان']);
});

test('continuation lines without a college separator add to the previous college', () => {
  const { groups } = parseMajorsBatch('الهندسة المدنية: الجسور\nالطرق والمطارات');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].majors, ['الجسور', 'الطرق والمطارات']);
});

test('ignores blank and comment lines and dedupes majors', () => {
  const { groups, problems } = parseMajorsBatch('# تعليق\n\nالعلوم: الفيزياء, الفيزياء\n');
  assert.equal(problems.length, 0);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].majors, ['الفيزياء']);
});

test('reports short major names as problems', () => {
  const { groups, problems } = parseMajorsBatch('الآداب: أ');
  assert.equal(groups[0].majors.length, 0);
  assert.equal(problems.length, 1);
});

test('resolves college names tolerantly and falls back to the selected college', () => {
  const colleges = [{ id: 7, name: 'كلية العلوم' }, { id: 9, name: 'كلية الاداب' }];
  const parsed = parseMajorsBatch('كليه العلوم: رياضيات\nفيزياء');
  const { matched, unmatched } = resolveBatchGroups(parsed.groups, colleges, 11);
  assert.deepEqual(unmatched, []);
  assert.deepEqual(matched[0], { collegeId: 7, collegeName: 'كلية العلوم', majors: ['رياضيات', 'فيزياء'] });
});

test('reports unmatched colleges and uses the fallback for unnamed groups', () => {
  const colleges = [{ id: 7, name: 'كلية العلوم' }];
  const parsed = parseMajorsBatch('كلية غير موجودة: كيمياء');
  const { matched, unmatched } = resolveBatchGroups(parsed.groups, colleges, null);
  assert.deepEqual(matched, []);
  assert.deepEqual(unmatched, ['كلية غير موجودة']);

  const unnamed = parseMajorsBatch('رياضيات');
  const result = resolveBatchGroups(unnamed.groups, colleges, 7);
  assert.deepEqual(result.matched[0], { collegeId: 7, collegeName: '', majors: ['رياضيات'] });
});

test('normalizeCollegeKey ignores hamza/tashkeel and ta-marbuta differences', () => {
  assert.equal(normalizeCollegeKey('كُلّية الآداب'), normalizeCollegeKey('كلية الاداب'));
});
