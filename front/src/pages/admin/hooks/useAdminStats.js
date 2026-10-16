import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../api/admin.js";

export function useAdminStats(eventId = null) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = eventId ? { event_id: eventId } : {};
      const res = await adminRequest("/api/admin/stats", { query });
      setStats(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
