import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../api/admin.js";

export function useAdminAudit({ eventId = null, exceptionalOnly = true, limit = 50, offset = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = { limit, offset, exceptional_only: exceptionalOnly };
      if (eventId) query.event_id = eventId;
      const res = await adminRequest("/api/admin/audit-logs", { query });
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [eventId, exceptionalOnly, limit, offset]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  return { data, loading, error, refetch: fetchAudit };
}
