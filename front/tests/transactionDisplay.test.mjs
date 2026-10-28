/* B4.1 + B4.3 + B4.4 — مدقق رقم العملية وعرضه كما كُتب تمامًا */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');

import { validateTransactionId } from '../src/utils/payments.js';

/* ---------- جدول القيم (B4.4) ---------- */
test('validateTransactionId accepts a mixed-case alphanumeric id', () => {
  assert.equal(validateTransactionId('A1B2-9x'), '');
});

test('validateTransactionId keeps lowercase exactly as typed', () => {
  assert.equal(validateTransactionId('ab-1234'), '');
});

test('validateTransactionId trims surrounding spaces and stays valid', () => {
  assert.equal(validateTransactionId('  ab-Cd12  '), '');
});

test('validateTransactionId rejects shorter than 4 characters', () => {
  assert.equal(validateTransactionId('123'), 'رقم العملية قصير جداً (4 خانات على الأقل)');
});

test('validateTransactionId rejects spaces inside', () => {
  assert.equal(
    validateTransactionId('abc def'),
    'رقم العملية يقبل أحرفاً وأرقاماً إنجليزية وشرطة فقط، بدون مسافات'
  );
});

test('validateTransactionId rejects Arabic-Indic digits', () => {
  assert.equal(
    validateTransactionId('١٢٣٤٥'),
    'رقم العملية يقبل أحرفاً وأرقاماً إنجليزية وشرطة فقط، بدون مسافات'
  );
});

test('validateTransactionId rejects longer than 100 characters', () => {
  const long = 'a'.repeat(101);
  assert.equal(
    validateTransactionId(long),
    'رقم العملية يقبل أحرفاً وأرقاماً إنجليزية وشرطة فقط، بدون مسافات'
  );
  assert.equal(validateTransactionId('a'.repeat(100)), '');
});

test('validateTransactionId rejects empty and whitespace-only', () => {
  assert.equal(validateTransactionId(''), 'يرجى إدخال رقم العملية');
  assert.equal(validateTransactionId('   '), 'يرجى إدخال رقم العملية');
  assert.equal(validateTransactionId(null), 'يرجى إدخال رقم العملية');
  assert.equal(validateTransactionId(undefined), 'يرجى إدخال رقم العملية');
});

/* ---------- خصائص الحقل (B4.2) ---------- */
const shamCash = readFileSync(join(srcDir, 'pages', 'student', 'ShamCashPayment.jsx'), 'utf8');

test('transaction input uses text keyboard, ltr, maxLength 100 and no autocorrect', () => {
  assert.match(shamCash, /inputMode="text"/);
  assert.match(shamCash, /autoCapitalize="off"/);
  assert.match(shamCash, /autoCorrect="off"/);
  assert.match(shamCash, /spellCheck=\{false\}/);
  assert.match(shamCash, /dir="ltr"/);
  assert.match(shamCash, /maxLength=\{100\}/);
  // placeholder يحوي حروفاً وأرقاماً معًا
  assert.match(shamCash, /placeholder="مثال: Ab12-9x"/);
  // لا inputMode=numeric على حقل رقم العملية (numeric موجود فقط لحقل المبلغ)
  assert.doesNotMatch(shamCash, /transactionId[\s\S]{0,400}inputMode="numeric"/);
});

test('the form sends the trimmed value without any case change', () => {
  assert.match(shamCash, /transaction_number:\s*formData\.transactionId\.trim\(\)/);
});

/* ---------- فحص ثابت: لا تحويل حالة لرقم العملية في كل الواجهة (B4.3/B4.4) ---------- */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(jsx?|css)$/.test(entry.name)) out.push(p);
  }
  return out;
}

test('no toUpperCase anywhere in src', () => {
  for (const f of walk(srcDir)) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes('.toUpperCase('), `found .toUpperCase( in ${f}`);
  }
});

test('no uppercase text-transform applied to the transaction number display', () => {
  // عرض رقم العملية في صفحة طلبات الإدارة
  const css = readFileSync(join(srcDir, 'style', 'AdminPaymentRequests.css'), 'utf8');
  const txBlock = css.slice(css.indexOf('.pay-req-txref'));
  const rule = txBlock.slice(0, txBlock.indexOf('}') + 1);
  assert.ok(!/text-transform:\s*uppercase/.test(rule), '.pay-req-txref must not uppercase');
  // وبشكل عام: لا قاعدة uppercase مرتبطة بأي صنف رقم عملية
  for (const f of walk(join(srcDir, 'style'))) {
    const text = readFileSync(f, 'utf8');
    const blocks = text.split('}');
    for (const b of blocks) {
      if (/tx[-_]?ref|transaction/i.test(b.split('{')[0] || '') && /text-transform:\s*uppercase/.test(b)) {
        assert.fail(`uppercase on a transaction-number class in ${f}`);
      }
    }
  }
});
