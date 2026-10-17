import { Navigate, useLocation } from "react-router-dom";
import { getGraduateToken, isGraduateTokenExpired } from "../api/session";
import useMyTicket from "../hooks/useMyTicket";

/* المسار الصحيح الذي يجب أن يكون فيه الخريج حسب حالة تذكرته */
export function routeForTicket(data) {
  if (!data || !data.has_ticket) return "/tickets";
  switch (data.ticket?.status) {
    case "AWAITING_PAYMENT":
      return "/payment";
    case "PROCESSING":
      return "/payment-submitted";
    case "REJECTED":
      return "/payment-rejected";
    case "CONFIRMED":
      return "/my-ticket";
    default:
      return "/tickets";
  }
}

export function hasValidGraduateSession() {
  return !!getGraduateToken() && !isGraduateTokenExpired();
}

/*
 * حارس مسارات التذكرة:
 * - بدون جلسة صالحة -> /login
 * - مع جلسة: يجلب التذكرة ويوجّه الخريج للصفحة المطابقة لحالتها
 *   (فلو فتح رابطاً خاطئاً بالخطأ يُعاد توجيهه تلقائياً للصفحة الصحيحة).
 */
export default function TicketGuard({ children }) {
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
  if (target !== location.pathname) {
    return <Navigate to={target} replace />;
  }
  return children;
}
