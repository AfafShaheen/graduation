export const SCANNER_ACCESS_TOKEN_KEY = "scanner_access_token";
export const SCANNER_EVENT_KEY = "scanner_event";
export const SCANNER_EXPIRES_AT_KEY = "scanner_expires_at";

export function getToken(key) {
  return sessionStorage.getItem(key);
}

export function setToken(key, value) {
  sessionStorage.setItem(key, value);
}

export function removeToken(key) {
  sessionStorage.removeItem(key);
}

export function getScannerToken() {
  return sessionStorage.getItem(SCANNER_ACCESS_TOKEN_KEY);
}

export function setScannerSession({ accessToken, expiresIn, event }) {
  sessionStorage.setItem(SCANNER_ACCESS_TOKEN_KEY, accessToken);
  sessionStorage.setItem(SCANNER_EVENT_KEY, JSON.stringify(event));
  const expiresAt = Date.now() + expiresIn * 1000;
  sessionStorage.setItem(SCANNER_EXPIRES_AT_KEY, String(expiresAt));
}

export function getScannerEvent() {
  const raw = sessionStorage.getItem(SCANNER_EVENT_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isScannerTokenExpired() {
  const expiresAt = sessionStorage.getItem(SCANNER_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt);
}

export function clearScannerSession() {
  sessionStorage.removeItem(SCANNER_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(SCANNER_EVENT_KEY);
  sessionStorage.removeItem(SCANNER_EXPIRES_AT_KEY);
  sessionStorage.removeItem("grad.scanner");
}

export function clearGraduateSession() {
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("verification_token");
  sessionStorage.removeItem("registration_token");
  sessionStorage.removeItem("grad.email");
  sessionStorage.removeItem("grad.student");
  sessionStorage.removeItem("grad.ticket");
  sessionStorage.removeItem("grad.payment");
}

export function clearAdminSession() {
  sessionStorage.removeItem("grad.admin");
}

export function clearSession() {
  clearGraduateSession();
}

export function clearAllSessions() {
  clearGraduateSession();
  clearScannerSession();
  clearAdminSession();
}
