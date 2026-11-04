import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf-8');

test('the brand font is four small WOFF2 subsets, not five full OTF files', () => {
  const css = read('src/index.css');
  assert.doesNotMatch(css, /\.otf/);
  assert.equal((css.match(/\.woff2'\) format\('woff2'\)/g) || []).length, 4);
  for (const weight of ['Regular', 'Medium', 'Bold', 'ExtraBold']) {
    const size = fs.statSync(new URL(`src/assets/fonts/itfGhroobArabic-${weight}.woff2`, root)).size;
    assert.ok(size < 45000, `${weight} is ${size} bytes`);
  }
  assert.ok(!fs.existsSync(new URL('src/assets/fonts/itfGhroobArabic-Bold.otf', root)), 'the full OTF is not bundled');
});

test('text files are compressed and hashed files are cached by the web server', () => {
  const htaccess = read('public/.htaccess');
  assert.match(htaccess, /mod_deflate/);
  assert.match(htaccess, /image\/svg\+xml/);
  assert.match(htaccess, /mod_expires/);
  assert.match(htaccess, /index\\.html/, 'index.html must not be cached for a year');
});

test('pages wait behind a skeleton, not a bare "loading" line', () => {
  assert.ok(read('src/components/TicketGuard.jsx').includes('<PageSkeleton />'));
  assert.ok(read('src/App.jsx').includes('fallback={<PageSkeleton />}'));
  const css = read('src/style/PageSkeleton.css');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(read('src/components/PageSkeleton.jsx'), /role="status"/);
});
