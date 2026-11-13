import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateScannerPassword, NO_PASSWORD_TEXT } from '../src/utils/scannerPassword.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('a generated password is readable, with letters and digits, never a look-alike character', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    const p = generateScannerPassword();
    seen.add(p);
    assert.equal(p.length, 10);
    assert.match(p, /[A-Za-z]/);
    assert.match(p, /[0-9]/);
    assert.doesNotMatch(p, /[0O1lIi]/);
  }
  assert.ok(seen.size > 290, 'they are different each time');
  // deterministic with a given source of randomness (so it can be tested)
  let n = 0;
  const fixed = () => ((n += 0.137) % 1);
  assert.equal(generateScannerPassword(fixed), generateScannerPassword(((m) => () => ((m.n += 0.137) % 1))({ n: 0 })));
});

test('the admin sees the password as it is, can copy it, and an old account says how to get one', () => {
  const page = read('pages/admin/AdminScannersSettings.jsx');
  assert.ok(page.includes('<th>كلمة السر</th>'));
  assert.ok(page.includes('{item.password}') && page.includes('handleCopy(item)'));
  assert.ok(page.includes('NO_PASSWORD_TEXT') && NO_PASSWORD_TEXT.includes('أعد تعيينها'));
  assert.ok(page.includes('handleResetPassword(item)') && page.includes('resetScannerPassword(item.id)'));
  assert.ok(!page.includes('type="password"'), 'the field of the new password is readable');
  assert.ok(page.includes('generateScannerPassword()'));
  assert.ok(page.includes('colSpan={5}'), 'the table has five columns now');
});

test('the new password stays on screen long enough to be read', () => {
  const page = read('pages/admin/AdminScannersSettings.jsx');
  assert.match(page, /كلمة السر الجديدة'\) \? 20000 : 3500/);
  assert.match(read('pages/admin/hooks/useAdminScanners.js'), /\/api\/admin\/scanners\/\$\{id\}\/reset-password/);
});
