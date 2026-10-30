import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)); // front/tests
const src = join(root, '..', 'src');

test('B3.2: admin login has no remember-me (D6)', () => {
  const jsx = readFileSync(join(src, 'pages/admin/AdminLogin.jsx'), 'utf8');
  const css = readFileSync(join(src, 'style/AdminLogin.css'), 'utf8');
  for (const needle of ['rememberMe', 'ad-remember-row', 'ad-checkbox']) {
    assert.ok(!jsx.includes(needle), `AdminLogin.jsx still contains ${needle}`);
    assert.ok(!css.includes(needle), `AdminLogin.css still contains ${needle}`);
  }
});

test('B3.3: dashboard header search is removed (D6)', () => {
  const jsx = readFileSync(join(src, 'pages/admin/AdminDashboard.jsx'), 'utf8');
  const css = readFileSync(join(src, 'style/AdminDashboard.css'), 'utf8');
  for (const needle of ['adm-search', 'searchQuery', 'handleSearch']) {
    assert.ok(!jsx.includes(needle), `AdminDashboard.jsx still contains ${needle}`);
    assert.ok(!css.includes(needle), `AdminDashboard.css still contains ${needle}`);
  }
});
