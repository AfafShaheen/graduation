import { useCallback, useEffect, useState } from "react";
import { getMyTicket } from "../api/graduate";
import { createTicketRequest } from "../utils/ticketRequest";
import { getGraduateToken, isGraduateTokenExpired } from "../api/session";

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

  const load = useCallback(async ({ force = false } = {}) => {
    const accessValue = getGraduateToken();
    if (!accessValue || isGraduateTokenExpired()) {
      setData(null);
      setError(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const result = await ticketRequest.fetch(accessValue, { force });
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => load({ force: true }), [load]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload };
}
