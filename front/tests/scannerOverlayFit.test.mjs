/*
 * B7.2 — فحص ثابت (static) لقواعد CSS الخاصة بطبقة نتائج المسح داخل إطار الكاميرا (D10).
 * لا يتوفر متصفح headless في بيئة العمل، لذلك نتحقق من الثوابت (invariants) نصياً:
 *  1) الطبقة لها كلاس واحد في ScannerCamera.css بخصائص الحاوية المطلوبة.
 *  2) داخل الطبقة: الحاويات والإطارات تحجّم نفسها بـ height:100% (لا vh/dvh على الإطارات المضمّنة).
 *  3) منطقة المحتوى فقط هي التي تمرر (overflow-y:auto + overscroll-behavior:contain + min-height:0).
 *  4) الهيدر والفوتر flex-shrink:0، والفوتر يحتفظ بحشو safe-area الأصلي في ملفاته.
 *  5) المسارات المستقلة (/scanner/error وغيرها) ما زالت تستخدم 100dvh خارج الطبقة.
 *  6) JSX يستخدم الكلاس بدل الـ inline style القديم.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)); // front/tests
const src = join(root, '..', 'src');

const camCss = readFileSync(join(src, 'style', 'ScannerCamera.css'), 'utf8');
const errCss = readFileSync(join(src, 'style', 'ScanErrorResult.css'), 'utf8');
const resCss = readFileSync(join(src, 'style', 'ScanSuccessResult.css'), 'utf8');
const cerCss = readFileSync(join(src, 'style', 'WrongCeremoniesWarning.css'), 'utf8');
const camJsx = readFileSync(join(src, 'pages', 'scanner', 'ScannerCamera.jsx'), 'utf8');

// استخراج جسم قاعدة CSS واحدة باسم محدد (أول ظهور على مستوى السطر)
function ruleBody(css, selector) {
  const idx = css.indexOf(selector);
  assert.ok(idx !== -1, `selector not found: ${selector}`);
  const open = css.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${selector}`);
}

// استخراج كل قواعد الطبقة (المحدد + البلوكات المتداخلة داخل @media) كقائمة أجسام القواعد
function overlayBlocks(css) {
  const blocks = [];
  // محددات بسيطة: سطر ينتهي بـ { ويبدأ بـ .scan-cam-result-overlay
  for (const m of css.matchAll(/^([ \t]*\.scan-cam-result-overlay[^{]*)\{([^}]*)\}/gm)) {
    blocks.push({ selector: m[1].replace(/\s+/g, ' ').trim(), body: m[2] });
  }
  // قواعد مختصرة داخل @media: "  .scan-cam-result-overlay .x { ... }" على سطر واحد أو متعدد
  const mediaIdx = css.indexOf('@media (max-height: 700px)');
  if (mediaIdx !== -1) {
    const openBrace = css.indexOf('{', mediaIdx);
    let depth = 0;
    let end = openBrace;
    for (let i = openBrace; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    const mediaBlock = css.slice(openBrace + 1, end);
    for (const m of mediaBlock.matchAll(/(\.scan-cam-result-overlay[^{]*)\{([^}]*)\}/g)) {
      blocks.push({ selector: m[1].replace(/\s+/g, ' ').trim(), body: m[2] });
    }
  }
  return blocks;
}

function selectorsContaining(css, cls) {
  return overlayBlocks(css).filter((b) => b.selector.includes(cls));
}

test('B7.2: overlay class exists with container-filling rules', () => {
  const body = ruleBody(camCss, '\n.scan-cam-result-overlay {');
  for (const decl of [
    'position: absolute;',
    'inset: 0;',
    'z-index: 40;',
    'display: flex;',
    'flex-direction: column;',
    'min-height: 0;',
    'overflow: hidden;',
  ]) {
    assert.ok(body.includes(decl), `overlay base rule missing "${decl}"`);
  }
});

test('B7.2: background per result type via modifier classes', () => {
  const errBody = ruleBody(camCss, '.scan-cam-result-overlay--error {');
  assert.match(errBody, /background-color:\s*#b3261e/);
  const okBody = ruleBody(camCss, '.scan-cam-result-overlay--success,');
  assert.match(okBody, /background-color:\s*var\(--sc-cream\)/);
  assert.ok(camCss.includes('.scan-cam-result-overlay--wrong_ceremony'));
});

test('B7.2: embedded frames size to the container (height:100%), no vh/dvh inside overlay', () => {
  // الإطارات الثلاثة مذكورة صراحة في قواعد height:100% داخل الطبقة
  for (const cls of ['scan-err-mobile-frame', 'scan-res-mobile-frame', 'wrong-cer-mobile-frame']) {
    const rules = selectorsContaining(camCss, cls);
    assert.ok(rules.length >= 1, `missing overlay override for ${cls}`);
    assert.ok(
      rules.some((r) => r.body.includes('height: 100%')),
      `${cls} is not sized to its container (height:100%)`
    );
  }
  // لا أي قاعدة داخل الطبقة تستخدم وحدات الـ viewport
  for (const block of overlayBlocks(camCss)) {
    assert.doesNotMatch(block.body, /\d+(vh|dvh)/, `overlay rule must not use viewport units: ${block.selector}`);
  }
});

test('B7.2: only the content region scrolls inside the overlay', () => {
  for (const cls of ['scan-err-content', 'scan-res-content', 'wrong-cer-main']) {
    const rules = selectorsContaining(camCss, cls).filter((r) => r.body.includes('overflow-y: auto'));
    assert.ok(rules.length >= 1, `${cls} has no scrolling overlay rule`);
    const b = rules[0].body;
    assert.ok(b.includes('min-height: 0'), `${cls} scroll rule must have min-height:0`);
    assert.ok(b.includes('overscroll-behavior: contain'), `${cls} scroll rule must contain overscroll`);
    assert.ok(b.includes('scrollbar-width: thin'), `${cls} scroll rule must use a thin scrollbar`);
  }
});

test('B7.2: header and footer are flex-shrink:0 inside the overlay', () => {
  for (const cls of [
    'scan-err-header',
    'scan-res-header',
    'wrong-cer-header',
    'scan-err-footer',
    'scan-res-footer',
    'wrong-cer-footer',
  ]) {
    const rules = selectorsContaining(camCss, cls);
    assert.ok(
      rules.some((r) => r.body.includes('flex-shrink: 0')),
      `overlay rule with flex-shrink:0 missing for ${cls}`
    );
  }
});

test('B7.2: footers keep the safe-area padding in their own stylesheets', () => {
  for (const [css, cls] of [
    [errCss, '.scan-err-footer'],
    [resCss, '.scan-res-footer'],
    [cerCss, '.wrong-cer-footer'],
  ]) {
    const body = ruleBody(css, `\n${cls} {`);
    assert.ok(
      body.includes('env(safe-area-inset-bottom'),
      `${cls} lost its safe-area padding-bottom`
    );
  }
});

test('B7.2: standalone routes keep 100dvh outside the overlay', () => {
  assert.ok(errCss.includes('height: 100dvh'), 'standalone error frame must keep 100dvh');
  assert.ok(cerCss.includes('height: 100dvh'), 'standalone wrong-ceremony frame must keep 100dvh');
  assert.match(resCss, /min-height:\s*100dvh/, 'standalone success frame must keep 100dvh');
});

test('B7.2: compact hero rules exist for short screens', () => {
  const shortMediaIdx = camCss.indexOf('@media (max-height: 700px)');
  assert.ok(shortMediaIdx !== -1, 'missing @media (max-height: 700px) block');
  const mediaBlock = camCss.slice(shortMediaIdx, camCss.indexOf('\n}', shortMediaIdx) + 2);
  assert.ok(mediaBlock.includes('.scan-err-hero'), 'hero compaction missing');
  assert.ok(mediaBlock.includes('.scan-err-badge-wrapper'), 'icon/halo compaction missing');
});

test('B7.2: ScannerCamera.jsx uses the overlay class instead of the old inline style', () => {
  assert.ok(
    camJsx.includes("scan-cam-result-overlay scan-cam-result-overlay--"),
    'overlay className with type modifier not found'
  );
  assert.ok(!camJsx.includes("inset: 0, zIndex: 40"), 'old inline overlay style still present');
});
