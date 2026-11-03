// html5-qrcode (and some browsers) reject with a plain string instead of an Error,
// so read the name/message from either shape before classifying the failure.
export function cameraErrorText(err) {
  if (typeof err === 'string') return err;
  return `${err?.name || ''} ${err?.message || ''}`.trim();
}
