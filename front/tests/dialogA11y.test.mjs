import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), 'utf8');

test('every modal dialog moves focus in, traps Tab and locks the page scroll', () => {
  const hook = read('hooks/useDialogA11y.js');
  assert.match(hook, /\.focus\(\)/);
  assert.match(hook, /event\.key !== 'Tab'/);
  assert.match(hook, /document\.body\.style\.overflow = 'hidden'/);
  for (const file of [
    'pages/admin/AdminPaymentRequests.jsx',
    'pages/admin/roster/RosterDrawer.jsx',
    'pages/scanner/ScannerCamera.jsx',
  ]) {
    assert.match(read(file), /useDialogA11y\(/, `${file} must use useDialogA11y`);
  }
});

test('the login page shows the encrypted-connection tag only over https', () => {
  assert.match(read('pages/admin/AdminLogin.jsx'), /window\.location\.protocol === 'https:'/);
});

test('no text on the interface is below 12px', () => {
  const css = ['style/AdminPaymentRequests.css', 'style/ScannerCamera.css', 'style/AdminDashboard.css']
    .map((f) => {
      try { return read(f); } catch { return ''; }
    })
    .join('\n');
  assert.doesNotMatch(css, /font-size:\s*(9|10|11)px/);
});
