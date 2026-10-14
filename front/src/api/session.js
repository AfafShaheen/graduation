export function getToken(key) {
  return sessionStorage.getItem(key);
}

export function setToken(key, value) {
  sessionStorage.setItem(key, value);
}

export function removeToken(key) {
  sessionStorage.removeItem(key);
}

export function clearSession() {
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("verification_token");
  sessionStorage.removeItem("registration_token");
}
