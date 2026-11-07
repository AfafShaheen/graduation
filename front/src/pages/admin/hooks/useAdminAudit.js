import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../../api/admin.js";

// The audit log for the filters and the page asked for. `query` comes from utils/auditFilters.js.
export function useAdminAudit(query, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const key = JSON.stringify(query);

  const fetchAudit = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminRequest("/api/admin/audit-logs", { query: JSON.parse(key) });
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [key, enabled]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  return { data, loading, error, refetch: fetchAudit };
}

// The groups of actions for the filter menu (labels come from the server).
export function useAuditActionMenu() {
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    let alive = true;
    adminRequest("/api/admin/audit-logs/actions")
      .then((res) => alive && setMenu(res))
      .catch(() => alive && setMenu({ exceptional: [], groups: [] })); // the log still works without the menu
    return () => {
      alive = false;
    };
  }, []);
  return menu;
}
