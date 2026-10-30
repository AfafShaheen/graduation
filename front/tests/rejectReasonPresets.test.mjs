import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// JSX files are loaded through Vite's SSR pipeline (same pattern as clientServerErrors.test.mjs).
let server;
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
});
after(async () => {
  await server.close();
});

const { REJECT_REASON_PRESETS } = await import('../src/config/rejectReasons.js');

test('reject reason presets: at least 3, unique, each between 3 and 255 chars', () => {
  assert.ok(REJECT_REASON_PRESETS.length >= 3, `expected >= 3 presets, got ${REJECT_REASON_PRESETS.length}`);
  const seen = new Set();
  for (const text of REJECT_REASON_PRESETS) {
    assert.equal(typeof text, 'string');
    assert.ok(!seen.has(text), `duplicate preset: ${text}`);
    seen.add(text);
    assert.equal(text, text.trim(), `preset has surrounding whitespace: ${text}`);
    assert.ok(text.length >= 3 && text.length <= 255, `preset length out of 3..255: ${text.length}`);
  }
});

test('RejectReasonPresets renders every preset as a button and onPick receives the text', async () => {
  const mod = await server.ssrLoadModule('/src/pages/admin/RejectReasonPresets.jsx');
  const Presets = mod.default;
  const picked = [];
  const html = renderToStaticMarkup(React.createElement(Presets, { onPick: (t) => picked.push(t) }));
  for (const text of REJECT_REASON_PRESETS) {
    // each preset appears as a <button> with its text inside
    const btnRe = new RegExp(`<button[^>]*>[^<]*${escapeRe(text)}[^<]*</button>`);
    assert.match(html, btnRe, `missing button for preset: ${text}`);
  }
  const buttonCount = (html.match(/<button/g) || []).length;
  assert.equal(buttonCount, REJECT_REASON_PRESETS.length);
  assert.match(html, /aria-label="أسباب رفض جاهزة"/);
  // onPick wiring: call the function component directly and walk the element tree it returns.
  const captured = [];
  const out = Presets({ onPick: (t) => picked.push(t) });
  collectButtons(out, captured);
  assert.equal(captured.length, REJECT_REASON_PRESETS.length);
  for (const b of captured) b.props.onClick();
  assert.deepEqual(picked, [...REJECT_REASON_PRESETS]);
});

// The component returns <div><button .../>...</div>; walk it and collect button elements.
function collectButtons(element, out) {
  if (!element || typeof element !== 'object') return;
  if (Array.isArray(element)) {
    for (const e of element) collectButtons(e, out);
    return;
  }
  if (element.type === 'button') out.push(element);
  const kids = element.props && element.props.children;
  if (kids !== undefined) {
    if (typeof kids === 'object') collectButtons(kids, out);
  }
}

test('AdminPaymentRequests reject modal wires the presets and shows the D2 sentence (static check)', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/pages/admin/AdminPaymentRequests.jsx', import.meta.url)), 'utf8');
  assert.ok(src.includes("import RejectReasonPresets from './RejectReasonPresets.jsx'"), 'modal must import the presets component');
  assert.ok(src.includes('<RejectReasonPresets'), 'modal must render the presets component');
  assert.ok(src.includes('سيظهر هذا السبب للخريج كما كُتب.'), 'modal must show the D2 sentence');
  assert.ok(src.includes('/255'), 'modal must show the n/255 counter');
  // existing validation untouched
  assert.ok(src.includes('reason.length < 3 || reason.length > 255'), 'existing 3..255 validation must stay');
});

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
