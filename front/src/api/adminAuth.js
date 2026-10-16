import { adminRequest } from "./admin.js";
import { getAdminToken } from "./adminSession.js";

export async function adminLogin(username, password) {
  const data = await adminRequest("/api/admin/auth/login", {
    method: "POST",
    body: { username, password },
  });
  return data;
}
