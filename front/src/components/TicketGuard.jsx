import { Navigate, useLocation } from "react-router-dom";
import { hasGraduateSession } from "../api/session";
import { routeForTicket } from "../utils/ticketRoute";
import useMyTicket from "../hooks/useMyTicket";

export { routeForTicket };

export function hasValidGraduateSession() {
  return hasGraduateSession();
}

/*
 * حارس مسارات التذكرة:
 * - بدون جلسة صالحة -> /login
 * - مع جلسة: يجلب التذكرة ويوجّه الخريج للصفحة المطابقة لحالتها
 *   (فلو فتح رابطاً خاطئاً بالخطأ يُعاد توجيهه تلقائياً للصفحة الصحيحة).
 * - استثناء: الخريج بانتظار الدفع أو مرفوض الدفع يقدر يفتح /tickets ليغيّر الباقة.
 */
export default function TicketGuard({ children }) {
  // React reuses the same TicketGuard instance when moving between ticket routes
  // (/tickets -> /payment ...), so its ticket data would be stale and bounce the
  // graduate back. Keying by path remounts it and re-fetches the ticket.
  const location = useLocation();
  return <TicketGuardInner key={location.pathname}>{children}</TicketGuardInner>;
}

function TicketGuardInner({ children }) {
  const location = useLocation();
  const { data, loading, error } = useMyTicket();

  if (!hasValidGraduateSession()) {
    return <Navigate to="/login" replace />;
  }
  if (loading) {
    return (
      <div className="route-guard-loading" role="status">
        جارٍ التحميل...
      </div>
    );
  }
  if (error) {
    return <Navigate to="/login" replace />;
  }

  const target = routeForTicket(data);
  const status = data?.ticket?.status;

  /* بانتظار الدفع أو مرفوض: مسموح له يرجع لاختيار الباقة */
  const canChangePackage =
    location.pathname === "/tickets" &&
    (status === "AWAITING_PAYMENT" || status === "REJECTED");

  if (!canChangePackage && target !== location.pathname) {
    return <Navigate to={target} replace />;
  }
  return children;
}