/* يستخرج رمز التحقق من جسم استجابة الخطأ (403) بأشكال مختلفة.
   الخلفية ترجعه داخل detail: { message, verification_token }
   بينما client.js يخزّن الجسم كاملاً في err.data، لذا نفحص المسارات المحتملة. */
export function extractVerificationToken(payload) {
  if (!payload || typeof payload !== "object") return null;

  const candidates = [
    payload.verification_token,
    payload.detail?.verification_token,
    payload.data?.verification_token,
    payload.error?.verification_token,
    payload.detail?.detail?.verification_token,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export default extractVerificationToken;
