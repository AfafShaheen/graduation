import { UNION_NAME } from '../config/brand.js';
import { formatShortCode } from './shortCode.js';

// تنزيل رموز QR كصور PNG منفصلة (بدل طباعة PDF).
// كل صورة: خلفية بيضاء + هامش أبيض حول الرمز (ضروري للمسح) + سطرين نص تحت الرمز.

/** اسم ملف آمن ومفهوم لكل رمز. */
export function qrFileName(kind, index, universityId) {
  const id = String(universityId || '').replace(/[^0-9A-Za-z_-]/g, '') || 'ticket';
  return kind === 'GRADUATE' ? `qr-graduate-${id}.png` : `qr-companion-${index}-${id}.png`;
}

function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

// the union's symbol for the header of the image; the image still downloads without it
async function loadSymbol() {
  try {
    const img = new Image();
    img.src = new URL('../assets/union-symbol.png', import.meta.url).href;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * يحوّل عنصر SVG لرمز QR إلى PNG وينزّله.
 * lines: سطور نص تُكتب تحت الرمز (الأول عريض).
 */
async function renderQrPng(svg, lines = [], shortCode = '') {
  if (!svg) return null;
  const img = await svgToImage(svg);
  const symbol = await loadSymbol();
  const qrSize = 720;
  const pad = 72; // هامش أبيض حول الرمز
  const lineHeight = 52;
  const headerH = 250; // the union's symbol and name
  const codeH = shortCode ? 150 : 0; // the short code, large enough to read from a phone screen
  const textBlock = lines.length ? lines.length * lineHeight + 24 : 0;
  const canvas = document.createElement('canvas');
  canvas.width = qrSize + pad * 2;
  canvas.height = headerH + qrSize + pad * 2 + codeH + textBlock;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  if (symbol) ctx.drawImage(symbol, (canvas.width - 150) / 2, 24, 150, 150);
  ctx.fillStyle = '#c51a1b';
  ctx.font = 'bold 46px Ghroob, Tahoma, Arial, sans-serif';
  ctx.fillText(UNION_NAME, canvas.width / 2, 224);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, pad, headerH + pad, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  let y = headerH + qrSize + pad * 2;
  if (shortCode) {
    ctx.fillStyle = '#594138';
    ctx.font = '30px Ghroob, Tahoma, Arial, sans-serif';
    ctx.fillText('الرمز اليدوي', canvas.width / 2, y - 24);
    ctx.fillStyle = '#124d44';
    ctx.direction = 'ltr';
    ctx.font = 'bold 76px Consolas, "Courier New", monospace';
    ctx.fillText(formatShortCode(shortCode), canvas.width / 2, y + 62);
    ctx.direction = 'rtl';
    y += codeH;
  }
  ctx.fillStyle = '#124d44';
  lines.forEach((text, i) => {
    ctx.font = `${i === 0 ? 'bold 40px' : '32px'} Ghroob, Tahoma, Arial, sans-serif`;
    ctx.fillText(String(text), canvas.width / 2, y + 8 + lineHeight * (i + 0.7));
  });

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function downloadQrPng(svg, filename, lines = [], shortCode = '') {
  const blob = await renderQrPng(svg, lines, shortCode);
  if (blob) triggerDownload(blob, filename);
}

/**
 * Opens the phone's share sheet (WhatsApp, Telegram...) with the QR image so the graduate can send
 * it to the companion. Where files cannot be shared it downloads the image instead.
 * Returns 'shared', 'downloaded' or 'cancelled'.
 */
export async function shareQrPng(svg, filename, lines = [], text = '', shortCode = '') {
  const blob = await renderQrPng(svg, lines, shortCode);
  if (!blob) return 'cancelled';
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      return err && err.name === 'AbortError' ? 'cancelled' : 'downloaded';
    }
  }
  triggerDownload(blob, filename);
  return 'downloaded';
}

/** ينزّل عدة صور واحدة تلو الأخرى (بفاصل قصير حتى لا يحجبها المتصفح). */
export async function downloadQrPngs(items, gapMs = 450) {
  for (let i = 0; i < items.length; i += 1) {
    const { svg, filename, lines, shortCode } = items[i];
    await downloadQrPng(svg, filename, lines, shortCode);
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
}
