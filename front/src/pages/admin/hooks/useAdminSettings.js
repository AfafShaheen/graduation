import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../../api/admin.js";

export function useAdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminRequest("/api/admin/settings");
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

  return { settings, loading, error, refetch: fetchSettings };
}

export async function updateAdminSettings(payload) {
  return await adminRequest("/api/admin/settings", { method: "PUT", body: payload });
}

export async function uploadShamcashQr(file) {
  const formData = new FormData();
  formData.append("file", file);
  const { adminForm } = await import("../../../api/admin.js");
  return await adminForm("/api/admin/settings/shamcash-qr", formData, "PUT");
}

export async function deleteShamcashQr() {
  return await adminRequest("/api/admin/settings/shamcash-qr", { method: "DELETE" });
}
