import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)); // front/tests
const frontDir = join(root, '..');
const srcDir = join(frontDir, 'src');

const OLD_PHRASES = [
  'حفل تخرج جامعة حمص',
  'حفل تخرج الدفعة',
  'الدفعة 44',
  'دفعة 2026',
  'فرع حمص لاتحاد',
  'بالتعاون مع فرع',
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(jsx?|mjs|css)$/.test(entry)) out.push(p);
  }
  return out;
}

test('none of the old ceremony phrases remains in front/src, index.html or seo.config.json', () => {
  const files = [...walk(srcDir), join(frontDir, 'index.html'), join(frontDir, 'seo.config.json')];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const phrase of OLD_PHRASES) {
      assert.ok(!text.includes(phrase), `${f} still contains old phrase: ${phrase}`);
    }
  }
});

test('the SEO config carries the fixed ceremony sentence', () => {
  const cfg = JSON.parse(readFileSync(join(frontDir, 'seo.config.json'), 'utf8'));
  const serialized = JSON.stringify(cfg);
  assert.ok(serialized.includes('اتحاد الطلبة جامعة حمص حفل تخريج الدفعة 3'), 'seo.config.json missing CEREMONY_TITLE sentence');
  assert.ok(serialized.includes('الدفعة 3'), 'seo.config.json missing batch badge');
});

test('every page that showed the old header now imports the brand constants', () => {
  const pages = [
    'pages/student/GraduateGuide.jsx',
    'pages/student/GraduateQuestions.jsx',
    'pages/student/GraduationFormStep1.jsx',
    'pages/student/GraduationFormStep2.jsx',
    'pages/student/Login.jsx',
    'pages/student/MyTicket.jsx',
    'pages/student/OrderRejected.jsx',
    'pages/student/OrderStatus.jsx',
    'pages/student/Otp.jsx',
    'pages/student/ResetPassword.jsx',
    'pages/student/SelectTicket.jsx',
    'pages/student/ShamCashPayment.jsx',
    'pages/admin/AdminLogin.jsx',
    'pages/scanner/ScannerLogin.jsx',
  ];
  for (const rel of pages) {
    const text = readFileSync(join(srcDir, rel), 'utf8');
    assert.ok(/from\s+['"][^'"]*config\/brand['"]/.test(text), `${rel} does not import config/brand`);
    assert.ok(/CEREMONY_TITLE|BATCH_BADGE/.test(text), `${rel} does not use brand constants`);
  }
});
