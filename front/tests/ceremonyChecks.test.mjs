import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ceremonyFieldErrors, cleanCeremonyName, isValidWhatsappLink } from '../src/utils/ceremonyChecks.js';

test('a name of spaces only is refused, a good name is cleaned', () => {
  assert.ok(ceremonyFieldErrors({ name: '    ', whatsappLink: 'https://chat.whatsapp.com/x' }).name);
  assert.ok(ceremonyFieldErrors({ name: 'ح', whatsappLink: 'https://chat.whatsapp.com/x' }).name);
  assert.equal(cleanCeremonyName('  حفل   تخرج  2030 '), 'حفل تخرج 2030');
  assert.deepEqual(ceremonyFieldErrors({ name: 'حفل التخرج', whatsappLink: 'https://chat.whatsapp.com/abc' }), {});
});

test('the WhatsApp link is required and must be a whole http(s) link without spaces', () => {
  assert.ok(ceremonyFieldErrors({ name: 'حفل', whatsappLink: '' }).whatsapp_group_link);
  for (const bad of ['abc', 'chat.whatsapp.com/x', 'https://', 'ftp://a.b/c', 'https://a b.com', 'javascript:alert(1)']) {
    assert.equal(isValidWhatsappLink(bad), false, bad);
  }
  assert.equal(isValidWhatsappLink(' https://chat.whatsapp.com/abc '), true);
});

test('the ceremony form checks these before sending and sends the cleaned values', () => {
  const form = fs.readFileSync(new URL('../src/pages/admin/AdminAddCeremony.jsx', import.meta.url), 'utf-8');
  assert.ok(form.includes('ceremonyFieldErrors({ name: ceremonyName, whatsappLink })'));
  assert.ok(form.includes('cleanCeremonyName(ceremonyName)') && form.includes('whatsappLink.trim()'));
});
