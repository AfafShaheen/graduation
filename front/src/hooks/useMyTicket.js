import { useCallback, useEffect, useState } from "react";
import { getMyTicket } from "../api/graduate";
import { createTicketRequest } from "../utils/ticketRequest";
import { getGraduateToken, hasGraduateSession } from "../api/session";

const ticketRequest = createTicketRequest(getMyTicket);

/*
 * المصدر الوحيد لحالة تذكرة الخريج.
 * يجلب GET /api/graduates/me/ticket ويعيد { data, loading, error, reload }.
 * كل الصفحات المرتبطة بالتذكرة تستخدمه بدل نسخ sessionStorage القديمة.
 */
export default function useMyTicket() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // silent: background refresh that keeps the current data on screen (no loading
  // state, and a failed attempt is ignored instead of replacing the page by an error).
  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    const accessValue = getGraduateToken();
    if (!accessValue || !hasGraduateSession()) {
      setData(null);
      setError(null);
      setLoading(false);
      return null;
    }
    if (!silent) setLoading(true);
    try {
      const result = await ticketRequest.fetch(accessValue, { force });
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      if (!silent) setError(err);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const reload = useCallback(() => load({ force: true }), [load]);
  const refresh = useCallback(() => load({ force: true, silent: true }), [load]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload, refresh };
}
