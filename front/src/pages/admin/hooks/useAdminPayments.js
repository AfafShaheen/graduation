import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../../api/admin.js";

export function useAdminPayments({ eventId = null, status = "PROCESSING", limit = 50, offset = 0 } = {}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPayments = useCallback(async () => {
    if (!eventId) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = { status, limit, offset };
      const res = await adminRequest(`/api/admin/events/${eventId}/payments`, { query });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [eventId, status, limit, offset]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  return { items, total, loading, error, refetch: fetchPayments };
}

export async function confirmTicket(ticketId) {
  return await adminRequest(`/api/admin/tickets/${ticketId}/confirm`, { method: "POST" });
}

export async function rejectTicket(ticketId, reason) {
  return await adminRequest(`/api/admin/tickets/${ticketId}/reject`, { method: "POST", body: { reason } });
}
