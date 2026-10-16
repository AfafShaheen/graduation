import { useEffect, useState, useCallback } from "react";
import { adminRequest, ApiError } from "../../../api/admin.js";

export function useAdminGraduates({ search = "", collegeId = "", skip = 0, limit = 50 } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchGraduates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = { skip, limit };
      if (search) query.search = search;
      if (collegeId) query.college_id = collegeId;
      const res = await adminRequest("/api/admin/graduates", { query });
      setItems(Array.isArray(res) ? res : res.items || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [search, collegeId, skip, limit]);

  useEffect(() => {
    fetchGraduates();
  }, [fetchGraduates]);

  return { items, loading, error, refetch: fetchGraduates };
}

export async function getGraduateDetail(id) {
  return await adminRequest(`/api/admin/graduates/${id}`);
}

export async function manualCheckIn(id) {
  return await adminRequest(`/api/admin/graduates/${id}/manual-check-in`, { method: "POST" });
}

export async function revertScan(id) {
  return await adminRequest(`/api/admin/graduates/${id}/revert-scan`, { method: "POST" });
}

export async function revertPayment(ticketId) {
  return await adminRequest(`/api/admin/tickets/${ticketId}/revert-payment`, { method: "POST" });
}

export async function updateGraduateEmail(id, email) {
  return await adminRequest(`/api/admin/graduates/${id}/email`, { method: "PUT", body: { email } });
}
