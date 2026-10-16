export function getAdminToken() {
  try {
    const raw = sessionStorage.getItem("grad.admin");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.token || null;
  } catch (err) {
    return null;
  }
}

export function getAdminUsername() {
  try {
    const raw = sessionStorage.getItem("grad.admin");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.username || null;
  } catch (err) {
    return null;
  }
}

export function setAdminSession(username, token) {
  sessionStorage.setItem("grad.admin", JSON.stringify({ username, token }));
}

export function clearAdminSession() {
  sessionStorage.removeItem("grad.admin");
}
