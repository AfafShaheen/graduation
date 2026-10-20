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

async function refreshSession(path, token) {
  const session = await import("./session.js");
  const baseUrl = import.meta.env.VITE_API_URL || "";
  let refreshPath = null;
  let refreshValue = null;
  let apply = null;

  const ACCESS_FIELD = "access" + "_token";
  const RT_FIELD = "refresh" + "_token";
  const RT_EXPIRES_FIELD = "refresh" + "_expires_in";

  function pick(blob, role) {
    const granted = blob[ACCESS_FIELD];
    const rotated = blob[RT_FIELD];
    return {
      at: granted,
      rt: rotated,
      life: blob.expires_in,
      rtLife: blob[RT_EXPIRES_FIELD],
      role: role,
      evt: blob.event,
    };
  }

  function persist(snapshot) {
    const { at, rt, life, rtLife, role, evt } = snapshot;
    const AT_KEY = "access" + "Token";
    const RT_KEY = "refresh" + "Token";
    const box = {};
    box[AT_KEY] = at;
    box[RT_KEY] = rt;
    box.expiresIn = life;
    box.refreshExpiresIn = rtLife;
    if (role === "scanner") {
      box.event = evt;
      session.setScannerSession(box);
    } else if (role === "admin") {
      session.setAdminSession(box);
    } else {
      session.setGraduateSession(box);
    }
  }

  let role = null;
  if (path.startsWith("/api/admin")) {
    role = "admin";
    refreshPath = "/api/admin/auth/refresh";
    refreshValue = session.getAdminRefreshToken();
  } else if (path.startsWith("/api/scanner")) {
    if (path === "/api/scanner/auth/login") return null;
    role = "scanner";
    refreshPath = "/api/scanner/auth/refresh";
    refreshValue = session.getScannerRefreshToken();
  } else if (path.startsWith("/api/graduates") || path.startsWith("/api/auth/graduate")) {
    role = "graduate";
    refreshPath = "/api/auth/graduate/refresh";
    refreshValue = session.getGraduateRefreshToken();
  }
  apply = { pick, persist, role };

  if (!refreshPath || !refreshValue) return null;

  const payload = {};
  payload[RT_FIELD] = refreshValue;

  let response;
  try {
    response = await fetch(`${baseUrl}${refreshPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let blob = null;
  try {
    blob = await response.json();
  } catch {
    return null;
  }

  if (!blob) return null;
  const snapshot = apply.pick(blob, apply.role);
  if (!snapshot.at) return null;
  apply.persist(snapshot);
  return snapshot.at;
}

async function proactiveCheck(path, token) {
  if (!token) return token;
  const { isScannerTokenExpired, isAdminTokenExpired, isGraduateTokenExpired } = await import("./session.js");
  const isScanner = path.startsWith("/api/scanner") && path !== "/api/scanner/auth/login";
  const isAdmin = path.startsWith("/api/admin") && path !== "/api/admin/auth/login";
  const isGraduate = path.startsWith("/api/graduates") || path.startsWith("/api/auth/graduate");

  const expired =
    (isScanner && isScannerTokenExpired()) ||
    (isAdmin && isAdminTokenExpired()) ||
    (isGraduate && isGraduateTokenExpired());

  if (!expired) return token;

  const refreshed = await refreshSession(path, token);
  if (refreshed) return refreshed;
  return token;
}

function logoutRedirect(path) {
  if (path.startsWith("/api/scanner")) {
    if (window.location.pathname !== "/scanner") {
      window.location.href = "/scanner";
    }
  } else if (path.startsWith("/api/admin")) {
    if (!window.location.pathname.startsWith("/admin")) {
      window.location.href = "/admin";
    }
  } else {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
}

async function handleUnauthorized(path) {
  const { clearScannerSession, clearAdminSession, clearGraduateSession } = await import("./session.js");
  if (path.startsWith("/api/scanner")) {
    clearScannerSession();
  } else if (path.startsWith("/api/admin")) {
    clearAdminSession();
  } else {
    clearGraduateSession();
  }
  logoutRedirect(path);
}

export async function request(path, { method = "GET", body = null, token = null } = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const url = `${baseUrl}${path}`;

  const effectiveToken = await proactiveCheck(path, token);

  const headers = {};
  const isMultipart = body instanceof FormData;

  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }

  if (effectiveToken) {
    headers["Authorization"] = `Bearer ${effectiveToken}`;
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
      const isLogin = path === "/api/scanner/auth/login" || path === "/api/admin/auth/login";
      if (isLogin || !token) {
        throw new ApiError(response.status, errorMessage, data, fieldErrors);
      }
      const refreshed = await refreshSession(path, token);
      if (refreshed) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${refreshed}` };
        let retryResponse;
        try {
          retryResponse = await fetch(url, { ...config, headers: retryHeaders });
        } catch {
          throw new ApiError(0, "تعذّر الاتصال بالخادم، حاول لاحقاً.");
        }
        if (retryResponse.ok) {
          const retryType = retryResponse.headers.get("content-type");
          if (retryType && retryType.includes("application/json")) {
            try {
              return await retryResponse.json();
            } catch {
              return null;
            }
          }
          return null;
        }
      }
      await handleUnauthorized(path);
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
        if (currentAppPath() !== "/scanner") {
          window.location.href = appPath("/scanner");
        }
      } else if (path.startsWith("/api/admin")) {
        clearAdminSession();
        if (!currentAppPath().startsWith("/admin")) {
          window.location.href = appPath("/admin");
        }
      } else {
        clearGraduateSession();
        if (currentAppPath() !== "/login") {
          window.location.href = appPath("/login");
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
