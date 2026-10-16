export function getAdminSession() {
  try {
    const raw = sessionStorage.getItem("grad.admin");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function getAdminToken() {
  const s = getAdminSession();
  return s?.token || null;
}

export function getAdminUsername() {
  const s = getAdminSession();
  return s?.username || null;
}

export function setAdminSession(username, token) {
  sessionStorage.setItem("grad.admin", JSON.stringify({ username, token }));
}

export function clearAdminSession() {
  sessionStorage.removeItem("grad.admin");
}

let adminUnauthorizedHandler = null;

export function setAdminUnauthorizedHandler(fn) {
  adminUnauthorizedHandler = fn;
}

export function notifyAdminUnauthorized() {
  clearAdminSession();
  if (typeof adminUnauthorizedHandler === "function") {
    adminUnauthorizedHandler();
  }
}
