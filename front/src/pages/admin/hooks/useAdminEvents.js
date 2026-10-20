import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../../api/admin.js";
import { cachedRequest, invalidate, CACHE_TTL } from "../../../api/cache.js";

export function useAdminEvents({ search = "", skip = 0, limit = 100, activeOnly = false } = {}) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cacheKey = `events:${search}:${skip}:${limit}:${activeOnly}`;

  const fetchEvents = useCallback(
    async ({ force = false } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const query = { skip, limit };
        if (search) query.search = search;
        if (activeOnly) query.active_only = true;
        const res = await cachedRequest(
          cacheKey,
          CACHE_TTL.events,
          () => adminRequest("/api/admin/events", { query }),
          { force },
        );
        setEvents(res.items || []);
        setTotal(res.total || 0);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, search, skip, limit, activeOnly],
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    total,
    loading,
    error,
    refetch: () => fetchEvents({ force: true }),
  };
}

export async function createAdminEvent(payload) {
  const res = await adminRequest("/api/admin/events", { method: "POST", body: payload });
  invalidate("events:");
  return res;
}

export async function getAdminEvent(id) {
  return await adminRequest(`/api/admin/events/${id}`);
}

export async function updateAdminEvent(id, payload) {
  const res = await adminRequest(`/api/admin/events/${id}`, { method: "PUT", body: payload });
  invalidate("events:");
  return res;
}

export async function uploadUniversityRecords(eventId, file) {
  const { adminForm, ApiError: Err } = await import("../../../api/admin.js");
  const form = new FormData();
  form.append("file", file);
  const res = await adminForm(`/api/admin/events/${eventId}/university-records`, form, "POST");
  invalidate("events:");
  if (res && Array.isArray(res.errors) && res.errors.length > 0) {
    throw new Err(0, res.errors.join("\n"), res);
  }
  return res;
}
