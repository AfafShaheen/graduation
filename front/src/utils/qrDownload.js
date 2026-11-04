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
async function renderQrPng(svg, lines = []) {
  if (!svg) return null;
  const img = await svgToImage(svg);
  const qrSize = 720;
  const pad = 72; // هامش أبيض حول الرمز
  const lineHeight = 52;
  const textBlock = lines.length ? lines.length * lineHeight + 24 : 0;
  const canvas = document.createElement('canvas');
  canvas.width = qrSize + pad * 2;
  canvas.height = qrSize + pad * 2 + textBlock;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, pad, pad, qrSize, qrSize);

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#124d44';
  lines.forEach((text, i) => {
    ctx.font = `${i === 0 ? 'bold 40px' : '32px'} Ghroob, Tahoma, Arial, sans-serif`;
    ctx.fillText(String(text), canvas.width / 2, qrSize + pad * 2 + 8 + lineHeight * (i + 0.7));
  });

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function downloadQrPng(svg, filename, lines = []) {
  const blob = await renderQrPng(svg, lines);
  if (blob) triggerDownload(blob, filename);
}

/**
 * Opens the phone's share sheet (WhatsApp, Telegram...) with the QR image so the graduate can send
 * it to the companion. Where files cannot be shared it downloads the image instead.
 * Returns 'shared', 'downloaded' or 'cancelled'.
 */
export async function shareQrPng(svg, filename, lines = [], text = '') {
  const blob = await renderQrPng(svg, lines);
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
    const { svg, filename, lines } = items[i];
    await downloadQrPng(svg, filename, lines);
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
}
