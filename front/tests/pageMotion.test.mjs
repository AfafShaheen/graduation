import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transitionDirection, isGraduatePath } from '../src/utils/pageDirection.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');

test('the next stage comes in forward, an earlier one back', () => {
  assert.equal(transitionDirection('/tickets', '/payment'), 'forward');
  assert.equal(transitionDirection('/payment', '/payment-submitted'), 'forward');
  assert.equal(transitionDirection('/payment', '/tickets'), 'back');
  assert.equal(transitionDirection('/my-ticket', '/tickets'), 'back');
});

test('same-rank pages, guides, login and the first load only fade', () => {
  assert.equal(transitionDirection('/payment-submitted', '/payment-rejected'), 'fade');
  assert.equal(transitionDirection('/tickets', '/guide/payment'), 'fade');
  assert.equal(transitionDirection('/login', '/tickets'), 'fade');
  assert.equal(transitionDirection(null, '/tickets'), 'fade');
});

test('admin and scanner screens never animate', () => {
  assert.equal(transitionDirection('/admin', '/admin/dashboard'), 'none');
  assert.equal(transitionDirection('/scanner', '/scanner/scan'), 'none');
  assert.equal(isGraduatePath('/admin/stats'), false);
});

test('motion is CSS only, off for reduced motion, and only moves opacity and transform', () => {
  const css = read('src/style/motion.css');
  assert.match(css, /prefers-reduced-motion: no-preference/);
  // every keyframe is opacity/transform only
  for (const [, body] of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) {
    assert.doesNotMatch(body, /\b(width|height|top|left|right|bottom|margin|padding)\s*:/);
  }
  assert.match(css, /\.pt \{\s*display: contents;/);
});

test('the routes are wrapped once and the old scroll effect is gone', () => {
  const app = read('src/App.jsx');
  assert.equal((app.match(/<PageTransition>/g) || []).length, 1);
  assert.ok(!app.includes('window.scrollTo(0, 0)'));
  const comp = read('src/components/PageTransition.jsx');
  assert.match(comp, /scrollRestoration/);
  assert.match(comp, /querySelector\('main h2'\)/);
});
