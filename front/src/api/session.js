export const SCANNER_ACCESS_TOKEN_KEY = "scanner_access_token";
export const SCANNER_EVENT_KEY = "scanner_event";
export const SCANNER_EXPIRES_AT_KEY = "scanner_expires_at";

const REGISTRATION_TOKEN_KEY = "registration_token";
const REGISTRATION_EXPIRES_AT_KEY = "registration_expires_at";

const VERIFICATION_TOKEN_KEY = "verification_token";
const GRADUATE_EMAIL_KEY = "grad.email";

const GRADUATE_ACCESS_TOKEN_KEY = "access_token";
const GRADUATE_EXPIRES_AT_KEY = "access_expires_at";

const ADMIN_ACCESS_TOKEN_KEY = "admin_access_token";
const ADMIN_EXPIRES_AT_KEY = "admin_expires_at";

const RESET_EMAIL_KEY = "reset.email";
const RESET_CODE_KEY = "reset.code";

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

export function getRegistrationToken() {
  return sessionStorage.getItem(REGISTRATION_TOKEN_KEY);
}

export function setRegistrationToken(token, expiresIn = 900) {
  sessionStorage.setItem(REGISTRATION_TOKEN_KEY, token);
  const expiresAt = Date.now() + expiresIn * 1000;
  sessionStorage.setItem(REGISTRATION_EXPIRES_AT_KEY, String(expiresAt));
}

export function isRegistrationTokenExpired() {
  const expiresAt = sessionStorage.getItem(REGISTRATION_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt);
}

export function clearRegistrationToken() {
  sessionStorage.removeItem(REGISTRATION_TOKEN_KEY);
  sessionStorage.removeItem(REGISTRATION_EXPIRES_AT_KEY);
}

export function getVerificationToken() {
  return sessionStorage.getItem(VERIFICATION_TOKEN_KEY);
}

export function setVerificationToken(token) {
  sessionStorage.setItem(VERIFICATION_TOKEN_KEY, token);
}

export function clearVerificationToken() {
  sessionStorage.removeItem(VERIFICATION_TOKEN_KEY);
}

export function getGraduateEmail() {
  return sessionStorage.getItem(GRADUATE_EMAIL_KEY);
}

export function setGraduateEmail(email) {
  sessionStorage.setItem(GRADUATE_EMAIL_KEY, email);
}

export function getGraduateToken() {
  return sessionStorage.getItem(GRADUATE_ACCESS_TOKEN_KEY);
}

export function setGraduateSession({ accessToken, expiresIn }) {
  sessionStorage.setItem(GRADUATE_ACCESS_TOKEN_KEY, accessToken);
  const expiresAt = Date.now() + expiresIn * 1000;
  sessionStorage.setItem(GRADUATE_EXPIRES_AT_KEY, String(expiresAt));
}

export function isGraduateTokenExpired() {
  const expiresAt = sessionStorage.getItem(GRADUATE_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt);
}

export function getAdminToken() {
  return sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
}

export function setAdminSession({ accessToken, expiresIn }) {
  sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, accessToken);
  const expiresAt = Date.now() + expiresIn * 1000;
  sessionStorage.setItem(ADMIN_EXPIRES_AT_KEY, String(expiresAt));
}

export function isAdminTokenExpired() {
  const expiresAt = sessionStorage.getItem(ADMIN_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt);
}

export function getResetEmail() {
  return sessionStorage.getItem(RESET_EMAIL_KEY);
}

export function setResetEmail(email) {
  sessionStorage.setItem(RESET_EMAIL_KEY, email);
}

export function getResetCode() {
  return sessionStorage.getItem(RESET_CODE_KEY);
}

export function setResetCode(code) {
  sessionStorage.setItem(RESET_CODE_KEY, code);
}

export function clearResetFlow() {
  sessionStorage.removeItem(RESET_EMAIL_KEY);
  sessionStorage.removeItem(RESET_CODE_KEY);
}

export function clearGraduateSession() {
  sessionStorage.removeItem(GRADUATE_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(GRADUATE_EXPIRES_AT_KEY);
  sessionStorage.removeItem(VERIFICATION_TOKEN_KEY);
  sessionStorage.removeItem(REGISTRATION_TOKEN_KEY);
  sessionStorage.removeItem(REGISTRATION_EXPIRES_AT_KEY);
  sessionStorage.removeItem(GRADUATE_EMAIL_KEY);
  sessionStorage.removeItem("grad.student");
  sessionStorage.removeItem("grad.ticket");
  sessionStorage.removeItem("grad.payment");
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_EXPIRES_AT_KEY);
  sessionStorage.removeItem("grad.admin");
}

export function clearSession() {
  clearGraduateSession();
}

export function clearAllSessions() {
  clearGraduateSession();
  clearScannerSession();
  clearAdminSession();
  clearResetFlow();
}
