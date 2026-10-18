import { useState, useEffect, useCallback } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { logoutAdmin } from "./api/admin";
import usePageMeta from "./hooks/usePageMeta";
import { forgotPassword } from "./api/graduate";
import TicketGuard from "./components/TicketGuard";
import GraduationFormStep1 from "./pages/student/GraduationFormStep1";
import GraduationFormStep2 from "./pages/student/GraduationFormStep2";
import Otp from "./pages/student/Otp";
import GraduateQuestions from "./pages/student/GraduateQuestions";
import Login from "./pages/student/Login";
import GraduateGuide from "./pages/student/GraduateGuide";
import ResetPassword from "./pages/student/ResetPassword";
import SelectTicket from "./pages/student/SelectTicket";
import ShamCashPayment from "./pages/student/ShamCashPayment";
import OrderStatus from "./pages/student/OrderStatus";
import OrderRejected from "./pages/student/OrderRejected";
import MyTicket from "./pages/student/MyTicket";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCeremonies from "./pages/admin/AdminCeremonies";
import AdminAddCeremony from "./pages/admin/AdminAddCeremony";
import AdminEditCeremonyRoute from "./pages/admin/AdminEditCeremonyRoute";
import AdminPaymentRequests from "./pages/admin/AdminPaymentRequests";
import AdminScannersSettings from "./pages/admin/AdminScannersSettings";
import AdminExceptions from "./pages/admin/AdminExceptions";
import AdminVolunteers from "./pages/admin/AdminVolunteers";
import { AdminStatsProvider } from "./context/AdminStatsContext";
import ScannerLogin from "./pages/scanner/ScannerLogin";
import ScannerCamera from "./pages/scanner/ScannerCamera";
import ScanSuccessResult from "./pages/scanner/ScanSuccessResult";
import ScanErrorResult from "./pages/scanner/ScanErrorResult";
import WrongCeremoniesWarning from "./pages/scanner/WrongCeremoniesWarning";
import { getScannerToken, isScannerTokenExpired, clearScannerSession, getGraduateToken, isGraduateTokenExpired, getAdminToken, isAdminTokenExpired, clearAdminSession, getAdminUsername, getVerificationToken, getRegistrationToken, isRegistrationTokenExpired, getResetEmail, setResetEmail, getResetCode, getGraduateEmail } from "./api/session";

/*
  وضع المعاينة (للتصميم فقط):
  true  = أي صفحة بتفتح مباشرة من شريط العنوان بدون شروط، بقيم تجريبية.
  false = الشروط شغالة (مثلاً الدفع لا يُفتح بدون باقة)، وهذا هو الوضع الصحيح عند الإطلاق.
*/
const PREVIEW = true;

/* "لا تعرض لي دليل التذكرة مرة أخرى": بنحفظها بـ localStorage لتضل حتى بعد إغلاق المتصفح */
/* مؤقت لحد ما يجهز الباك إند، بعدها الأفضل تنحفظ على حساب الخريج */
const GUIDE_SKIP_KEY = "grad.skipGuide";
function readSkipGuide() {
  try {
    return localStorage.getItem(GUIDE_SKIP_KEY) === "1";
  } catch (err) {
    return false;
  }
}
function saveSkipGuide() {
  try {
    localStorage.setItem(GUIDE_SKIP_KEY, "1");
  } catch (err) {
    /* التخزين غير متاح: نكمل بدونه */
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;

  const [pendingPayments, setPendingPayments] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  usePageMeta({
    robots: pathname === "/" ? "index, follow" : "noindex, nofollow",
  });

  const refreshPendingPayments = useCallback(async () => {
    try {
      const { adminRequest } = await import("./api/admin.js");
      const res = await adminRequest("/api/admin/stats");
      setPendingPayments(res?.tickets?.processing ?? 0);
    } catch {
      /* نتجاهل الفشل — تبقى الشارة على آخر قيمة */
    }
  }, []);

  const handleAdminLogout = async () => {
    try {
      await logoutAdmin();
    } catch {
      /* نتجاهل أخطاء الخادم وننظف الجلسة محلياً */
    }
    clearAdminSession();
    navigate("/admin", { replace: true });
  };

  const hasValidGraduate = getGraduateToken() && !isGraduateTokenExpired();
  const hasValidAdmin = getAdminToken() && !isAdminTokenExpired();
  const hasVerifySession = getVerificationToken();
  const hasValidRegistration = getRegistrationToken() && !isRegistrationTokenExpired();
  const adminName = getAdminUsername();

  useEffect(() => {
    if (hasValidAdmin) {
      refreshPendingPayments();
    }
  }, [pathname, hasValidAdmin, refreshPendingPayments]);

  return (
    <AdminStatsProvider pendingPayments={pendingPayments} refreshPendingPayments={refreshPendingPayments}>
      <Routes>
        {/* ===== التسجيل ===== */}
        <Route
          path="/"
          element={
            <GraduationFormStep1
              onNavigateToLogin={() => navigate("/login")}
              onNext={() => navigate("/register")}
            />
          }
        />

        <Route
          path="/register"
          element={
            hasValidRegistration || PREVIEW ? (
              <GraduationFormStep2
                onBack={() => navigate("/")}
                onNavigateToLogin={() => navigate("/login")}
                onNext={() => {
                  navigate("/otp");
                }}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/otp"
          element={
            hasVerifySession || PREVIEW ? (
              <Otp
                mode="register"
                email={getGraduateEmail() || undefined}
                onBack={() => navigate("/register")}
                onVerified={() => navigate("/questions", { replace: true })}
              />
            ) : (
              <Navigate to="/register" replace />
            )
          }
        />

        {/* ===== بعد تأكيد البريد: سؤالان عن المسؤولية والخبرة، ثم دليل التذكرة، ثم اختيار التذكرة ===== */}
        <Route
          path="/questions"
          element={
            hasValidGraduate || PREVIEW ? (
              <GraduateQuestions
                onDone={(answers) => {
                  navigate("/guide", { replace: true }); // الدليل أولاً، ومنه لاختيار التذكرة
                }}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* ===== تسجيل الدخول ===== */}
        <Route
          path="/login"
          element={
            <Login
              initialEmail={getResetEmail() || ""}
              notice={
                location.state?.passwordReset
                  ? "تم تغيير كلمة السر بنجاح، يمكنك تسجيل الدخول الآن"
                  : ""
              }
              onBack={() => navigate("/")}
              onNavigateToRegister={() => navigate("/")}
              // بعد الدخول: دليل التذكرة أولاً (إلا إذا اختار الخريج "لا تعرضها مرة أخرى")
              onLoginSuccess={() =>
                navigate(readSkipGuide() ? "/tickets" : "/guide", {
                  replace: true,
                })
              }
              onForgotPassword={(em) => {
                setResetEmail(em);
                navigate("/reset-otp");
              }}
            />
          }
        />

        {/* ===== استعادة كلمة السر: رمز التحقق ثم كلمة سر جديدة ===== */}
        <Route
          path="/reset-otp"
          element={
            getResetEmail() || PREVIEW ? (
              <Otp
                mode="reset"
                email={getResetEmail() || undefined}
                onBack={() => navigate("/login")}
                onVerified={() => navigate("/reset-password")}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/reset-password"
          element={
            getResetEmail() && getResetCode() ? (
              <ResetPassword
                onBack={() => navigate("/login")}
                onDone={() => navigate("/login", { state: { passwordReset: true } })}
              />
            ) : PREVIEW ? (
              <ResetPassword
                onBack={() => navigate("/login")}
                onDone={() => navigate("/login", { state: { passwordReset: true } })}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* ===== بعد الدخول: دليل التذكرة، ثم اختيار التذكرة ===== */}
        <Route
          path="/guide"
          element={
            <GraduateGuide
              supportPhone="" // رقم اتحاد الطلبة (اختياري)
              onContinue={({ dontShowAgain }) => {
                if (dontShowAgain) saveSkipGuide();
                navigate("/tickets", { replace: true });
              }}
            />
          }
        />

        {/* ===== اختيار التذكرة ثم الدفع ===== */}
        <Route
          path="/tickets"
          element={
            <TicketGuard>
              <SelectTicket onBack={() => navigate("/login")} />
            </TicketGuard>
          }
        />

        <Route
          path="/payment"
          element={
            <TicketGuard>
              <ShamCashPayment onBack={() => navigate("/tickets")} />
            </TicketGuard>
          }
        />

        <Route
          path="/payment-submitted"
          element={
            <TicketGuard>
              <OrderStatus />
            </TicketGuard>
          }
        />

        {/* صفحة الرفض جنب الدفع: الحارس يتحقق من حالة التذكرة ويعيد التوجيه حسب الحاجة */}
        <Route
          path="/payment-rejected"
          element={
            <TicketGuard>
              <OrderRejected />
            </TicketGuard>
          }
        />

        {/* ===== التذكرة بعد تأكيد الدفع ===== */}
        <Route
          path="/my-ticket"
          element={
            <TicketGuard>
              <MyTicket />
            </TicketGuard>
          }
        />

        {/* ===== الإدارة: بتنفتح من الرابط /admin فقط، وما في أي رابط إلها بصفحات الطلاب ===== */}
        <Route
          path="/admin"
          element={<AdminLogin onLoginSuccess={() => navigate("/admin/dashboard")} />}
        />

        <Route
          path="/admin/dashboard"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminDashboard
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== الحفلات ===== */}
        <Route
          path="/admin/ceremonies"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminCeremonies
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddCeremony={() => navigate("/admin/ceremonies/new")}
                onEditCeremony={(item) =>
                  navigate(`/admin/ceremonies/${item.id}/edit`, {
                    state: { eventItem: item },
                  })
                }
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== إضافة حفل جديد (بتنفتح من زر "إضافة حفل جديد" بصفحة الحفلات) ===== */}
        <Route
          path="/admin/ceremonies/new"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminAddCeremony
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onCancel={() => navigate("/admin/ceremonies")}
                onSubmitSuccess={() => navigate("/admin/ceremonies")}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== تعديل حفل (بتنفتح من زر التعديل بصفحة الحفلات) ===== */}
        <Route
          path="/admin/ceremonies/:id/edit"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminEditCeremonyRoute
                key={location.state?.eventItem?.id}
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== طلبات الدفع ===== */}
        <Route
          path="/admin/payments"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminPaymentRequests
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onPendingChanged={refreshPendingPayments}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== الماسحون وإعدادات الدفع ===== */}
        <Route
          path="/admin/scanners"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminScannersSettings
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== الإجراءات الاستثنائية ===== */}
        <Route
          path="/admin/actions"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminExceptions
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== المتطوعون ===== */}
        <Route
          path="/admin/volunteers"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminVolunteers
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* أي مسار إدارة غير معرّف: ارجع للوحة التحكم */}
        <Route
          path="/admin/*"
          element={<Navigate to="/admin/dashboard" replace />}
        />

        {/* ===== الماسح: بتنفتح من الرابط /scanner فقط، وما في أي رابط إلها بصفحات الطلاب ===== */}
        <Route
          path="/scanner"
          element={
            <ScannerLogin
              onLoginSuccess={() => {
                navigate("/scanner/scan");
              }}
            />
          }
        />
        <Route
          path="/scanner/scan"
          element={
            getScannerToken() && !isScannerTokenExpired() ? (
              <ScannerCamera
                onLogout={() => {
                  clearScannerSession();
                  navigate("/scanner", { replace: true });
                }}
              />
            ) : (
              <Navigate to="/scanner" replace />
            )
          }
        />
        <Route
          path="/scanner/result"
          element={
            (getScannerToken() && !isScannerTokenExpired()) || PREVIEW ? (
              <ScanSuccessResult onNextScan={() => navigate("/scanner/scan")} />
            ) : (
              <Navigate to="/scanner" replace />
            )
          }
        />
        {/* ===== رفض الدخول: تذكرة مستخدمة مسبقاً أو مرافق قبل الخريج ===== */}
        {/* للمعاينة: /scanner/error?type=companion_error (الافتراضي: already_used) */}
        <Route
          path="/scanner/error"
          element={
            (getScannerToken() && !isScannerTokenExpired()) || PREVIEW ? (
              <ScanErrorResult
                errorType={
                  new URLSearchParams(location.search).get("type") ||
                  location.state?.errorType ||
                  "already_used"
                }
                onNextScan={() => navigate("/scanner/scan")}
              />
            ) : (
              <Navigate to="/scanner" replace />
            )
          }
        />

        {/* ===== تنبيه: التذكرة تابعة لحفل ثاني ===== */}
        <Route
          path="/scanner/wrong-ceremony"
          element={
            (getScannerToken() && !isScannerTokenExpired()) || PREVIEW ? (
              <WrongCeremoniesWarning onNextScan={() => navigate("/scanner/scan")} />
            ) : (
              <Navigate to="/scanner" replace />
            )
          }
        />

        {/* أي مسار ماسح غير معرّف: مؤقتاً لحد ما يجهز */}
        <Route
          path="/scanner/*"
          element={
            (getScannerToken() && !isScannerTokenExpired()) || PREVIEW ? (
              <div
                style={{ padding: 24, textAlign: "center", direction: "rtl" }}
              >
                شاشة المسح قيد الإنشاء
                <br />
                <button
                  type="button"
                  onClick={() => {
                    clearScannerSession();
                    navigate("/scanner", { replace: true });
                  }}
                >
                  تسجيل الخروج
                </button>
              </div>
            ) : (
              <Navigate to="/scanner" replace />
            )
          }
        />

        {/* اختصار: /dashboard يودّي للوحة الإدارة */}
        <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminStatsProvider>
  );
}

export default App;
