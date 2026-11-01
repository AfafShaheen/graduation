import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
let mod;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  mod = await server.ssrLoadModule('/src/utils/cleanServerMessage.js');
});

// cleanup not strictly needed for node:test but close server
after(async () => {
  await server.close();
});

test('strips "Value error, " prefix (English comma)', () => {
  assert.equal(mod.cleanServerMessage('Value error, رقم غير صالح'), 'رقم غير صالح');
});

test('strips "Value error، " prefix (Arabic comma)', () => {
  assert.equal(mod.cleanServerMessage('Value error، رقم غير صالح'), 'رقم غير صالح');
});

test('strips "Value error " prefix without comma', () => {
  assert.equal(mod.cleanServerMessage('Value error بريد غير صالح'), 'بريد غير صالح');
});

test('case-insensitive prefix', () => {
  assert.equal(mod.cleanServerMessage('VALUE ERROR, بريد غير صالح'), 'بريد غير صالح');
});

test('leaves Arabic message without prefix unchanged', () => {
  assert.equal(mod.cleanServerMessage('الرقم الجامعي مطلوب'), 'الرقم الجامعي مطلوب');
});

test('returns empty for null/undefined/empty', () => {
  assert.equal(mod.cleanServerMessage(null), '');
  assert.equal(mod.cleanServerMessage(undefined), '');
  assert.equal(mod.cleanServerMessage(''), '');
});

test('replaces English-only message with Arabic fallback', () => {
  assert.equal(mod.cleanServerMessage('Field required'), 'قيمة غير صالحة');
  assert.equal(mod.cleanServerMessage('Value error, Field required'), 'قيمة غير صالحة');
});

test('trims whitespace', () => {
  assert.equal(mod.cleanServerMessage('  Value error,  مطلوب  '), 'مطلوب');
});

test('default export works', () => {
  assert.equal(typeof mod.default, 'function');
  assert.equal(mod.default('Value error, ok بالعربية'), 'ok بالعربية');
});