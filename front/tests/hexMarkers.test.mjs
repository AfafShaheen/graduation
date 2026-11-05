import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const block = (css, selector) => {
  const start = css.indexOf(`
${selector} {`);
  return css.slice(start, css.indexOf('}', start));
};

test('one hexagon shape is defined once and the small markers use it', () => {
  assert.match(read('src/index.css'), /--hex: polygon\(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%\)/);
  for (const [file, selector] of [
    ['src/style/GraduateGuide.css', '.guide-number'],
    ['src/style/SelectTicket.css', '.st-notice-icon-bg'],
    ['src/style/SelectTicket.css', '.st-radio-circle'],
  ]) {
    const b = block(read(file), selector);
    assert.match(b, /clip-path: var\(--hex\)/, selector);
    assert.doesNotMatch(b, /border-radius: 9999px/, selector);
  }
});

test('the tabs keep their shape', () => {
  assert.doesNotMatch(read('src/style/StageHeader.css'), /clip-path/);
});

test('the brand colours live in one place and the pages use them', () => {
  const index = read('src/index.css');
  for (const token of ['--brand-green', '--brand-orange', '--brand-red', '--brand-danger', '--brand-cream']) {
    assert.ok(index.includes(`${token}:`), token);
  }
  const stage = read('src/style/StageHeader.css');
  assert.ok(stage.includes('var(--brand-green)') && stage.includes('var(--brand-orange)'));
  assert.ok(read('src/style/UnionBrand.css').includes('var(--brand-red)'));
  assert.doesNotMatch(stage, /#124d44|#ca4b00/i);
});
