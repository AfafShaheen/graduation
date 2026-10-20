import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../../api/admin.js";
import { cachedRequest, invalidate, CACHE_TTL } from "../../../api/cache.js";

export function useAdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await cachedRequest(
        "admin-settings",
        CACHE_TTL.settings,
        () => adminRequest("/api/admin/settings"),
        { force },
      );
      setSettings(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    refetch: () => fetchSettings({ force: true }),
  };
}

export async function updateAdminSettings(payload) {
  const res = await adminRequest("/api/admin/settings", { method: "PUT", body: payload });
  invalidate("admin-settings");
  return res;
}

export async function uploadShamcashQr(file) {
  const formData = new FormData();
  formData.append("file", file);
  const { adminForm } = await import("../../../api/admin.js");
  const res = await adminForm("/api/admin/settings/shamcash-qr", formData, "PUT");
  invalidate("admin-settings");
  return res;
}

export async function deleteShamcashQr() {
  const res = await adminRequest("/api/admin/settings/shamcash-qr", { method: "DELETE" });
  invalidate("admin-settings");
  return res;
}
