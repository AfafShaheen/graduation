// Builds public/og-image.png (the share card). The text needs real Arabic shaping, which
// @napi-rs/canvas does and Pillow without raqm does not.
// Run from the front folder:  node brand-src/make_og_image.cjs
// (install @napi-rs/canvas somewhere and point NODE_PATH at its node_modules; it is not a
// project dependency)
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

GlobalFonts.registerFromPath('font-src/itfGhroobArabic-ExtraBold.otf', 'GhroobXB');
GlobalFonts.registerFromPath('font-src/itfGhroobArabic-Bold.otf', 'GhroobB');

(async () => {
  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFF4E0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#CA4B00';
  ctx.fillRect(0, 0, W, 14);

  const symbol = await loadImage('src/assets/union-symbol.png');
  ctx.drawImage(symbol, W - 400 - 90, (H - 400) / 2, 400, 400);

  const right = W - 90 - 400 - 60;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#C51A1B';
  ctx.font = '84px GhroobXB';
  ctx.fillText('اتحاد الطلبة', right, 235);
  ctx.fillText('جامعة حمص', right, 335);
  ctx.fillStyle = '#124D44';
  ctx.font = '54px GhroobB';
  ctx.fillText('حفل تخريج الدفعة 3', right, 440);
  ctx.fillStyle = '#CA4B00';
  ctx.fillRect(right - 220, 480, 220, 6);

  fs.writeFileSync('public/og-image.png', canvas.toBuffer('image/png'));
  console.log('done');
})();
