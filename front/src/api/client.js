export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.message = message;
    this.data = data;
    this.name = "ApiError";
  }
}

export async function request(path, { method = "GET", body = null, token = null } = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const url = `${baseUrl}${path}`;

  // Proactive expiration check for scanner requests (excluding login)
  if (token && path.startsWith("/api/scanner") && path !== "/api/scanner/auth/login") {
    const { isScannerTokenExpired, clearScannerSession } = await import("./session.js");
    if (isScannerTokenExpired()) {
      clearScannerSession();
      if (window.location.pathname !== "/scanner") {
        window.location.href = "/scanner";
      }
      throw new ApiError(401, "انتهت جلسة الماسح، يرجى إعادة تسجيل الدخول.");
    }
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
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
    if (data) {
      if (typeof data.detail === "string") {
        errorMessage = data.detail;
      } else if (Array.isArray(data.detail)) {
        errorMessage = "يرجى التحقق من البيانات المدخلة.";
      } else if (typeof data.message === "string") {
        errorMessage = data.message;
      }
    }

    if (response.status === 401) {
      if (path === "/api/scanner/auth/login") {
        throw new ApiError(response.status, errorMessage, data);
      }
      if (!token) {
        throw new ApiError(response.status, errorMessage, data);
      }
      const { clearGraduateSession, clearScannerSession } = await import("./session.js");
      if (path.startsWith("/api/scanner")) {
        clearScannerSession();
        if (window.location.pathname !== "/scanner") {
          window.location.href = "/scanner";
        }
      } else if (path.startsWith("/api/admin")) {
        sessionStorage.removeItem("grad.admin");
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

    throw new ApiError(response.status, errorMessage, data);
  }

  return data;
}
