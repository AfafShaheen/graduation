import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { hasGraduateSession, getGraduateId } from "../api/session";
import { pendingGuideFor } from "../utils/guideAck";
import { guidePath } from "../utils/stage";
import { routeForTicket } from "../utils/ticketRoute";
import useMyTicket from "../hooks/useMyTicket";
import PageSkeleton from "./PageSkeleton";
import LoadError from "./LoadError";

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
 * - استثناء: المرفوض يقدر يفتح /payment ليعيد إرسال الدفع (زر «إعادة الدفع»).
 * - أول مرة تُفتح فيها مرحلة (باقة، دفع، انتظار، تذكرة) يظهر دليلها إلزامياً قبل الصفحة.
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
  const navigate = useNavigate();
  const { data, loading, error, reload } = useMyTicket();

  if (!hasValidGraduateSession()) {
    return <Navigate to="/login" replace />;
  }
  if (loading) {
    return <PageSkeleton />;
  }
  if (error) {
    // only an invalid session sends him to the login page; a network or server problem can be retried
    if (error.status === 401 || error.status === 403) return <Navigate to="/login" replace />;
    return <LoadError onRetry={reload} onLogin={() => navigate("/login")} />;
  }

  const target = routeForTicket(data);
  const status = data?.ticket?.status;

  /* بانتظار الدفع أو مرفوض: مسموح له يرجع لاختيار الباقة */
  const canChangePackage =
    location.pathname === "/tickets" &&
    (status === "AWAITING_PAYMENT" || status === "REJECTED");

  /* مرفوض: زر «إعادة الدفع» يفتح صفحة الدفع مباشرة بدل الرجوع لصفحة الرفض */
  const canResubmitPayment = location.pathname === "/payment" && status === "REJECTED";

  if (!canChangePackage && !canResubmitPayment && target !== location.pathname) {
    return <Navigate to={target} replace />;
  }

  /* the graduate is on the right page: the guide of this stage must have been read first */
  const guide = pendingGuideFor(location.pathname, getGraduateId());
  if (guide) {
    return <Navigate to={guidePath(guide)} replace state={{ next: location.pathname }} />;
  }
  return children;
}