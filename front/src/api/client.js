export class ApiError extends Error {
  constructor(status, message, data = null, fieldErrors = null) {
    super(message);
    this.status = status;
    this.message = message;
    this.data = data;
    this.fieldErrors = fieldErrors;
    this.name = "ApiError";
  }
}

async function proactiveCheck(path, token) {
  if (!token) return;
  const { isScannerTokenExpired, clearScannerSession, isAdminTokenExpired, clearAdminSession, isGraduateTokenExpired, clearGraduateSession } = await import("./session.js");
  if (path.startsWith("/api/scanner") && path !== "/api/scanner/auth/login") {
    if (isScannerTokenExpired()) {
      clearScannerSession();
      if (window.location.pathname !== "/scanner") {
        window.location.href = "/scanner";
      }
      throw new ApiError(401, "انتهت جلسة الماسح، يرجى إعادة تسجيل الدخول.");
    }
  } else if (path.startsWith("/api/admin")) {
    if (path !== "/api/admin/auth/login" && isAdminTokenExpired()) {
      clearAdminSession();
      if (!window.location.pathname.startsWith("/admin")) {
        window.location.href = "/admin";
      }
      throw new ApiError(401, "انتهت جلسة الإدارة، يرجى إعادة تسجيل الدخول.");
    }
  } else if (path.startsWith("/api/graduates") || path.startsWith("/api/auth/graduate")) {
    if (isGraduateTokenExpired()) {
      clearGraduateSession();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      throw new ApiError(401, "انتهت الجلسة، يرجى تسجيل الدخول.");
    }
  }
}

export async function request(path, { method = "GET", body = null, token = null } = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const url = `${baseUrl}${path}`;

  await proactiveCheck(path, token);

  const headers = {};
  const isMultipart = body instanceof FormData;

  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = { method, headers };

  if (body) {
    config.body = isMultipart ? body : JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch {
    throw new ApiError(0, "تعذّر الاتصال بالخادم، حاول لاحقاً.");
  }

  let data = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    let errorMessage = "حدث خطأ غير متوقع.";
    let fieldErrors = null;

    if (data) {
      if (typeof data.detail === "string") {
        errorMessage = data.detail;
      } else if (Array.isArray(data.detail)) {
        fieldErrors = {};
        for (const item of data.detail) {
          const field = item.loc?.[item.loc.length - 1] || "general";
          fieldErrors[field] = item.msg;
        }
        errorMessage = "يرجى التحقق من البيانات المدخلة.";
      } else if (typeof data.detail === "object" && data.detail !== null) {
        errorMessage = data.detail.message || JSON.stringify(data.detail);
      } else if (typeof data.message === "string") {
        errorMessage = data.message;
      }
    }

    if (response.status === 401) {
      if (path === "/api/scanner/auth/login" || path === "/api/admin/auth/login") {
        throw new ApiError(response.status, errorMessage, data, fieldErrors);
      }
      if (!token) {
        throw new ApiError(response.status, errorMessage, data, fieldErrors);
      }
      const { clearGraduateSession, clearScannerSession, clearAdminSession } = await import("./session.js");
      if (path.startsWith("/api/scanner")) {
        clearScannerSession();
        if (window.location.pathname !== "/scanner") {
          window.location.href = "/scanner";
        }
      } else if (path.startsWith("/api/admin")) {
        clearAdminSession();
        if (!window.location.pathname.startsWith("/admin")) {
          window.location.href = "/admin";
        }
      } else {
        clearGraduateSession();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    throw new ApiError(response.status, errorMessage, data, fieldErrors);
  }

  return data;
}

export async function requestBlob(path, { token } = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const url = `${baseUrl}${path}`;

  await proactiveCheck(path, token);

  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw new ApiError(0, "تعذّر الاتصال بالخادم، حاول لاحقاً.");
  }

  if (!response.ok) {
    let errorMessage = "فشل تنزيل الملف.";
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        const errData = await response.json();
        if (typeof errData.detail === "string") {
          errorMessage = errData.detail;
        } else if (typeof errData.detail === "object" && errData.detail !== null && typeof errData.detail.message === "string") {
          errorMessage = errData.detail.message;
        }
      } catch {}
    }

    if (response.status === 401 && token) {
      const { clearGraduateSession, clearScannerSession, clearAdminSession } = await import("./session.js");
      if (path.startsWith("/api/scanner")) {
        clearScannerSession();
        if (window.location.pathname !== "/scanner") {
          window.location.href = "/scanner";
        }
      } else if (path.startsWith("/api/admin")) {
        clearAdminSession();
        if (!window.location.pathname.startsWith("/admin")) {
          window.location.href = "/admin";
        }
      } else {
        clearGraduateSession();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    throw new ApiError(response.status, errorMessage);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  let filename = "download";
  const match = disposition.match(/filename="?([^"]+)"?/);
  if (match) {
    filename = match[1];
  }

  return { blob, filename };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
