import { useEffect, useState, useCallback } from "react";
import { adminRequest, adminBlob, downloadBlob, ApiError } from "../../api/admin.js";

export function useAdminVolunteers({ eventId = null, collegeId = "", q = "", wants = "", hasExp = "", sort = "newest", limit = 10, offset = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchVolunteers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = { limit, offset, sort };
      if (eventId) query.event_id = eventId;
      if (collegeId) query.college_id = collegeId;
      if (q) query.q = q;
      if (wants) query.wants_responsibility = wants;
      if (hasExp) query.has_experience = hasExp;
      const res = await adminRequest("/api/admin/volunteers", { query });
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [eventId, collegeId, q, wants, hasExp, sort, limit, offset]);

  useEffect(() => {
    fetchVolunteers();
  }, [fetchVolunteers]);

  return { data, loading, error, refetch: fetchVolunteers };
}

export async function exportVolunteers({ eventId = null, collegeId = "", q = "", wants = "", hasExp = "", sort = "newest" } = {}) {
  const query = { sort };
  if (eventId) query.event_id = eventId;
  if (collegeId) query.college_id = collegeId;
  if (q) query.q = q;
  if (wants) query.wants_responsibility = wants;
  if (hasExp) query.has_experience = hasExp;
  const { blob, filename } = await adminBlob("/api/admin/volunteers/export", query);
  downloadBlob(blob, filename);
}
