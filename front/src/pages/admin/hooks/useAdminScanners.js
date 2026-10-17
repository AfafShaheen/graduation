import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../../api/admin.js";

export function useAdminScanners(eventId = null) {
  const [scanners, setScanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchScanners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = eventId ? { event_id: eventId } : {};
      const res = await adminRequest("/api/admin/scanners", { query });
      setScanners(res || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchScanners();
  }, [fetchScanners]);

  return { scanners, loading, error, refetch: fetchScanners };
}

export async function createScanner(payload) {
  return await adminRequest("/api/admin/scanners", { method: "POST", body: payload });
}

export async function deleteScanner(id) {
  return await adminRequest(`/api/admin/scanners/${id}`, { method: "DELETE" });
}
