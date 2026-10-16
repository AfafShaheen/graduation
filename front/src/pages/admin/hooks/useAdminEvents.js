import { useEffect, useState } from "react";
import { adminRequest, ApiError } from "../../api/admin.js";

export function useAdminEvents({ search = "", skip = 0, limit = 100, activeOnly = false } = {}) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = { skip, limit };
      if (search) query.search = search;
      if (activeOnly) query.active_only = true;
      const res = await adminRequest("/api/admin/events", { query });
      setEvents(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [search, skip, limit, activeOnly]);

  return { events, total, loading, error, refetch: fetchEvents };
}

export async function createAdminEvent(payload) {
  return await adminRequest("/api/admin/events", { method: "POST", body: payload });
}

export async function getAdminEvent(id) {
  return await adminRequest(`/api/admin/events/${id}`);
}

export async function updateAdminEvent(id, payload) {
  return await adminRequest(`/api/admin/events/${id}`, { method: "PUT", body: payload });
}
