import { adminRequest } from "./admin.js";

export async function adminLogin(username, password) {
  const data = await adminRequest("/api/admin/auth/login", {
    method: "POST",
    body: { username, password },
  });
  return data;
}

export async function adminLogout() {
  return await adminRequest("/api/admin/auth/logout", { method: "POST" });
}
