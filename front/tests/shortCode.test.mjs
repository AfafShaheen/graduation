import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeShortCode, formatShortCode, scannableCode } from '../src/utils/shortCode.js';

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf-8');

test('what a volunteer types becomes the code the server expects', () => {
  assert.equal(normalizeShortCode('KM4829173'), 'KM4829173');
  assert.equal(normalizeShortCode(' km-482 9173 '), 'KM4829173');
  assert.equal(normalizeShortCode('km٤٨٢٩١٧٣'), 'KM4829173');
  assert.equal(normalizeShortCode('km۴۸۲۹۱۷۳'), 'KM4829173');
  for (const bad of ['', 'K4829173', 'KM482917', 'KM48291734', '1M4829173', null, undefined]) {
    assert.equal(normalizeShortCode(bad), null, String(bad));
  }
});

test('the code is shown in two parts, and the scanner takes a UUID or a short code only', () => {
  assert.equal(formatShortCode('KM4829173'), 'KM 4829173');
  assert.equal(formatShortCode(''), '');
  const uuid = 'c0293b1d-8a4e-4f2b-9e11-123456789abc';
  assert.equal(scannableCode(` ${uuid} `), uuid);
  assert.equal(scannableCode('km 4829173'), 'KM4829173');
  assert.equal(scannableCode('hello'), null);
});

test('the ticket page, the image and the scanner use the short code', () => {
  const page = read('pages/student/MyTicket.jsx');
  assert.ok(page.includes('<ShortCode value={graduateCode.short_code} />'));
  assert.ok(page.includes('<ShortCode value={code.short_code} />'));
  assert.ok(!page.includes('{graduateCode.code_value}</span>'), 'the long UUID is no longer printed under the QR');
  assert.ok(page.includes('shortCode: graduateCode.short_code') && page.includes('shortCode: code.short_code'));
  const image = read('utils/qrDownload.js');
  assert.ok(image.includes('UNION_NAME') && image.includes('union-symbol.png') && image.includes('formatShortCode'));
  const scanner = read('pages/scanner/ScannerCamera.jsx');
  assert.ok(scanner.includes('scannableCode(manualCode)'));
  assert.ok(!scanner.includes('UUID_REGEX'));
});
