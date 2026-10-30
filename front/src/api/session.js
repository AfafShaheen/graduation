export const SCANNER_ACCESS_TOKEN_KEY = "scanner_access_token";
export const SCANNER_EVENT_KEY = "scanner_event";
export const SCANNER_EXPIRES_AT_KEY = "scanner_expires_at";
export const SCANNER_REFRESH_TOKEN_KEY = "scanner_refresh_token";
export const SCANNER_REFRESH_EXPIRES_AT_KEY = "scanner_refresh_expires_at";

const REGISTRATION_TOKEN_KEY = "registration_token";
const REGISTRATION_EXPIRES_AT_KEY = "registration_expires_at";

const VERIFICATION_TOKEN_KEY = "verification_token";
const GRADUATE_EMAIL_KEY = "grad.email";

const GRADUATE_ACCESS_TOKEN_KEY = "access_token";
const GRADUATE_EXPIRES_AT_KEY = "access_expires_at";
const GRADUATE_REFRESH_TOKEN_KEY = "refresh_token";
const GRADUATE_REFRESH_EXPIRES_AT_KEY = "refresh_expires_at";

const ADMIN_ACCESS_TOKEN_KEY = "admin_access_token";
const ADMIN_EXPIRES_AT_KEY = "admin_expires_at";
const ADMIN_REFRESH_TOKEN_KEY = "admin_refresh_token";
const ADMIN_REFRESH_EXPIRES_AT_KEY = "admin_refresh_expires_at";
const ADMIN_USERNAME_KEY = "admin_username";

const RESET_EMAIL_KEY = "reset.email";
const RESET_CODE_KEY = "reset.code";

// Admin, graduate and scanner sessions must survive closing the tab or the browser
// (they last 30 days, 7 days and 24 hours), so they live in localStorage. Reads fall
// back to sessionStorage so a session saved by an older build is still understood;
// removing a key clears both. Short registration/reset flows keep using sessionStorage.
const persistent = {
  getItem(key) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    } catch {
      /* التخزين الدائم غير متاح */
    }
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      /* نرجع لتخزين الجلسة */
    }
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* لا يوجد تخزين */
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

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
  return persistent.getItem(SCANNER_ACCESS_TOKEN_KEY);
}

export function setScannerSession({ accessToken, expiresIn, event, refreshToken, refreshExpiresIn }) {
  persistent.setItem(SCANNER_ACCESS_TOKEN_KEY, accessToken);
  persistent.setItem(SCANNER_EVENT_KEY, JSON.stringify(event));
  const expiresAt = Date.now() + expiresIn * 1000;
  persistent.setItem(SCANNER_EXPIRES_AT_KEY, String(expiresAt));
  if (refreshToken) {
    persistent.setItem(SCANNER_REFRESH_TOKEN_KEY, refreshToken);
    const refreshExpiresAt = Date.now() + (refreshExpiresIn || 0) * 1000;
    persistent.setItem(SCANNER_REFRESH_EXPIRES_AT_KEY, String(refreshExpiresAt));
  }
}

export function getScannerRefreshToken() {
  return persistent.getItem(SCANNER_REFRESH_TOKEN_KEY);
}

export function getScannerEvent() {
  const raw = persistent.getItem(SCANNER_EVENT_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isScannerTokenExpired() {
  const expiresAt = persistent.getItem(SCANNER_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt);
}

export function clearScannerSession() {
  persistent.removeItem(SCANNER_ACCESS_TOKEN_KEY);
  persistent.removeItem(SCANNER_EVENT_KEY);
  persistent.removeItem(SCANNER_EXPIRES_AT_KEY);
  persistent.removeItem(SCANNER_REFRESH_TOKEN_KEY);
  persistent.removeItem(SCANNER_REFRESH_EXPIRES_AT_KEY);
  persistent.removeItem("grad.scanner");
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
  return persistent.getItem(GRADUATE_ACCESS_TOKEN_KEY);
}

export function setGraduateSession({ accessToken, expiresIn, refreshToken, refreshExpiresIn }) {
  persistent.setItem(GRADUATE_ACCESS_TOKEN_KEY, accessToken);
  const expiresAt = Date.now() + expiresIn * 1000;
  persistent.setItem(GRADUATE_EXPIRES_AT_KEY, String(expiresAt));
  if (refreshToken) {
    persistent.setItem(GRADUATE_REFRESH_TOKEN_KEY, refreshToken);
    const refreshExpiresAt = Date.now() + (refreshExpiresIn || 0) * 1000;
    persistent.setItem(GRADUATE_REFRESH_EXPIRES_AT_KEY, String(refreshExpiresAt));
  }
}

export function getGraduateRefreshToken() {
  return persistent.getItem(GRADUATE_REFRESH_TOKEN_KEY);
}

export function isGraduateTokenExpired() {
  const expiresAt = persistent.getItem(GRADUATE_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt);
}

export function getAdminToken() {
  return persistent.getItem(ADMIN_ACCESS_TOKEN_KEY);
}

export function setAdminSession({ accessToken, expiresIn, refreshToken, refreshExpiresIn }) {
  persistent.setItem(ADMIN_ACCESS_TOKEN_KEY, accessToken);
  const expiresAt = Date.now() + expiresIn * 1000;
  persistent.setItem(ADMIN_EXPIRES_AT_KEY, String(expiresAt));
  if (refreshToken) {
    persistent.setItem(ADMIN_REFRESH_TOKEN_KEY, refreshToken);
    const refreshExpiresAt = Date.now() + (refreshExpiresIn || 0) * 1000;
    persistent.setItem(ADMIN_REFRESH_EXPIRES_AT_KEY, String(refreshExpiresAt));
  }
}

export function getAdminRefreshToken() {
  return persistent.getItem(ADMIN_REFRESH_TOKEN_KEY);
}

export function isAdminTokenExpired() {
  const expiresAt = persistent.getItem(ADMIN_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt);
}

export function setAdminUsername(username) {
  if (username) {
    persistent.setItem(ADMIN_USERNAME_KEY, username);
  } else {
    persistent.removeItem(ADMIN_USERNAME_KEY);
  }
}

export function getAdminUsername() {
  return persistent.getItem(ADMIN_USERNAME_KEY);
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
  persistent.removeItem(GRADUATE_ACCESS_TOKEN_KEY);
  persistent.removeItem(GRADUATE_EXPIRES_AT_KEY);
  persistent.removeItem(GRADUATE_REFRESH_TOKEN_KEY);
  persistent.removeItem(GRADUATE_REFRESH_EXPIRES_AT_KEY);
  sessionStorage.removeItem(VERIFICATION_TOKEN_KEY);
  sessionStorage.removeItem(REGISTRATION_TOKEN_KEY);
  sessionStorage.removeItem(REGISTRATION_EXPIRES_AT_KEY);
  sessionStorage.removeItem(GRADUATE_EMAIL_KEY);
  sessionStorage.removeItem("grad.student");
  sessionStorage.removeItem("grad.ticket");
  sessionStorage.removeItem("grad.payment");
}

export function clearAdminSession() {
  persistent.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  persistent.removeItem(ADMIN_EXPIRES_AT_KEY);
  persistent.removeItem(ADMIN_REFRESH_TOKEN_KEY);
  persistent.removeItem(ADMIN_REFRESH_EXPIRES_AT_KEY);
  persistent.removeItem(ADMIN_USERNAME_KEY);
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

// A session is usable when the access token is still valid OR it can be renewed:
// the refresh token exists and has not reached the end of the session. The route
// guards must use these (not the *TokenExpired helpers, which only look at the short
// access token and would send the user to the login page every two hours).
function sessionAlive(accessKey, expiresKey, refreshKey, refreshExpiresKey) {
  if (!persistent.getItem(accessKey)) return false;
  const accessExpiresAt = Number(persistent.getItem(expiresKey));
  if (accessExpiresAt && Date.now() < accessExpiresAt) return true;
  const refreshExpiresAt = Number(persistent.getItem(refreshExpiresKey));
  return Boolean(persistent.getItem(refreshKey)) && refreshExpiresAt > Date.now();
}

export function hasScannerSession() {
  return sessionAlive(
    SCANNER_ACCESS_TOKEN_KEY,
    SCANNER_EXPIRES_AT_KEY,
    SCANNER_REFRESH_TOKEN_KEY,
    SCANNER_REFRESH_EXPIRES_AT_KEY,
  );
}

export function hasGraduateSession() {
  return sessionAlive(
    GRADUATE_ACCESS_TOKEN_KEY,
    GRADUATE_EXPIRES_AT_KEY,
    GRADUATE_REFRESH_TOKEN_KEY,
    GRADUATE_REFRESH_EXPIRES_AT_KEY,
  );
}

export function hasAdminSession() {
  return sessionAlive(
    ADMIN_ACCESS_TOKEN_KEY,
    ADMIN_EXPIRES_AT_KEY,
    ADMIN_REFRESH_TOKEN_KEY,
    ADMIN_REFRESH_EXPIRES_AT_KEY,
  );
}
