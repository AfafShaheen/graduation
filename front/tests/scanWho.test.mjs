import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scanWho } from '../src/utils/scanWho.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('the volunteer reads the graduate name, and for a companion which one of how many', () => {
  assert.deepEqual(scanWho({ code_type: 'GRADUATE', graduate_name: 'فاطمة أحمد' }), {
    name: 'فاطمة أحمد', role: 'الخريج', label: 'صاحب التذكرة', isCompanion: false,
  });
  assert.deepEqual(scanWho({ code_type: 'COMPANION', graduate_name: 'فاطمة أحمد', companion_number: 2, companions_count: 3 }), {
    name: 'فاطمة أحمد', role: 'المرافق رقم 2 من 3', label: 'مرافق الخريج', isCompanion: true,
  });
  assert.equal(scanWho({ code_type: 'COMPANION', graduate_name: 'فاطمة أحمد' }).role, 'مرافق', 'a missing number does not show "undefined"');
});

test('nothing to show when the server sent no name (unknown code, another ceremony)', () => {
  assert.equal(scanWho(null), null);
  assert.equal(scanWho({ decision: 'NOT_FOUND' }), null);
  assert.equal(scanWho({ decision: 'WRONG_EVENT', graduate_name: '   ' }), null);
});

test('the success and error screens show it, and the other ceremony is named on the wrong-ceremony screen', () => {
  const ok = read('pages/scanner/ScanSuccessResult.jsx');
  assert.ok(ok.includes('scanWho(data)') && ok.includes('scan-res-who-name'));
  const err = read('pages/scanner/ScanErrorResult.jsx');
  assert.ok(err.includes('scanWho(result || state.result)') && err.includes('scan-err-who-name'));
  const wrong = read('pages/scanner/WrongCeremoniesWarning.jsx');
  assert.ok(wrong.includes('scanResult?.ticket_event_name'));
  assert.ok(!wrong.includes('wrong-cer-grad-name'), 'no placeholder name for a ticket of another ceremony');
});

test('the drawer buttons are rectangles, two per row, and the name form is one field per line on a phone', () => {
  const css = read('style/AdminRoster.css');
  assert.match(css, /\.rost-drawer \.exc-actions-grid \{ grid-template-columns: repeat\(2/);
  assert.match(css, /\.rost-drawer \.exc-action-btn \{ border-radius: 16px/);
  assert.match(css, /\.exc-email-form\.exc-name-form \{ flex-direction: column/);
  assert.match(css, /@media \(max-width: 420px\) \{ \.exc-name-fields \{ grid-template-columns: 1fr/);
  assert.ok(read('pages/admin/roster/RosterDrawer.jsx').includes('<div className="exc-name-fields">'));
});
