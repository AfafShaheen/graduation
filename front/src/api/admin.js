export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.message = message;
    this.data = data;
    this.name = "ApiError";
  }
}

function buildQuery(query) {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function readErrorMessage(data) {
  if (!data) return "حدث خطأ غير متوقع.";
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return "يرجى التحقق من البيانات المدخلة.";
  if (typeof data.message === "string") return data.message;
  return "حدث خطأ غير متوقع.";
}

async function handleUnauthorized() {
  const { notifyAdminUnauthorized } = await import("./adminSession.js");
  notifyAdminUnauthorized();
}

async function resolveAuth(override) {
  if (override) return override;
  const mod = await import("./adminSession.js");
  return mod.getAdminToken();
}

function buildHeaders(auth, formData) {
  const headers = {};
  if (!formData) headers["Content-Type"] = "application/json";
  if (auth) headers["Authorization"] = `Bearer ${auth}`;
  return headers;
}

export async function adminRequest(path, { method = "GET", body = null, auth = null, formData = null, query = null } = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const url = `${baseUrl}${path}${buildQuery(query)}`;
  const resolved = await resolveAuth(auth);
  const headers = buildHeaders(resolved, formData);

  const config = { method, headers };
  if (formData) {
    config.body = formData;
  } else if (body) {
    config.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    throw new ApiError(0, "تعذّر الاتصال بالخادم، حاول لاحقاً.");
  }

  let data = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMessage = await readErrorMessage(data);
    if (response.status === 401) {
      await handleUnauthorized();
    }
    throw new ApiError(response.status, errorMessage, data);
  }

  return data;
}

export async function adminForm(path, formData, method = "POST", query = null) {
  return await adminRequest(path, { method, formData, query });
}

export async function adminBlob(path, query = null) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const url = `${baseUrl}${path}${buildQuery(query)}`;
  const resolved = await resolveAuth(null);
  const headers = buildHeaders(resolved, null);

  let response;
  try {
    response = await fetch(url, { method: "GET", headers });
  } catch (err) {
    throw new ApiError(0, "تعذّر الاتصال بالخادم، حاول لاحقاً.");
  }

  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
    const errorMessage = await readErrorMessage(data);
    if (response.status === 401) {
      await handleUnauthorized();
    }
    throw new ApiError(response.status, errorMessage, data);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  let filename = "export.xlsx";
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (match) {
    try {
      filename = decodeURIComponent(match[1]);
    } catch (e) {
      filename = match[1];
    }
  }
  return { blob, filename };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
