import { lazy, Suspense, useState, useEffect, useCallback } from "react";
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
import StageGuide from "./pages/student/StageGuide";
import PageSkeleton from "./components/PageSkeleton";
import PageTransition from "./components/PageTransition";
import ResetPassword from "./pages/student/ResetPassword";
import SelectTicket from "./pages/student/SelectTicket";
import ShamCashPayment from "./pages/student/ShamCashPayment";
import OrderStatus from "./pages/student/OrderStatus";
import OrderRejected from "./pages/student/OrderRejected";
import MyTicket from "./pages/student/MyTicket";
import { AdminStatsProvider } from "./context/AdminStatsContext";
import { PENDING_PAYMENTS_POLL_MS, fetchPendingPaymentsTotal } from "./utils/pendingPayments.js";
import { hasScannerSession, hasGraduateSession, hasAdminSession, clearScannerSession, clearAdminSession, getAdminUsername, getVerificationToken, getRegistrationToken, isRegistrationTokenExpired, getResetEmail, setResetEmail, getResetCode, getGraduateEmail } from "./api/session";

// Admin and scanner screens are loaded on demand so graduates do not download them.
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminCeremonies = lazy(() => import("./pages/admin/AdminCeremonies"));
const AdminAddCeremony = lazy(() => import("./pages/admin/AdminAddCeremony"));
const AdminEditCeremonyRoute = lazy(() => import("./pages/admin/AdminEditCeremonyRoute"));
const AdminPaymentRequests = lazy(() => import("./pages/admin/AdminPaymentRequests"));
const AdminScannersSettings = lazy(() => import("./pages/admin/AdminScannersSettings"));
const AdminExceptions = lazy(() => import("./pages/admin/AdminExceptions"));
const AdminColleges = lazy(() => import("./pages/admin/AdminColleges"));
const AdminUniversityFiles = lazy(() => import("./pages/admin/AdminUniversityFiles"));
const AdminVolunteers = lazy(() => import("./pages/admin/AdminVolunteers"));
const ScannerLogin = lazy(() => import("./pages/scanner/ScannerLogin"));
const ScannerCamera = lazy(() => import("./pages/scanner/ScannerCamera"));
const ScanSuccessResult = lazy(() => import("./pages/scanner/ScanSuccessResult"));
const ScanErrorResult = lazy(() => import("./pages/scanner/ScanErrorResult"));
const WrongCeremoniesWarning = lazy(() => import("./pages/scanner/WrongCeremoniesWarning"));

/*
  وضع المعاينة (للتصميم فقط):
  true  = أي صفحة بتفتح مباشرة من شريط العنوان بدون شروط، بقيم تجريبية.
  false = الشروط شغالة (مثلاً الدفع لا يُفتح بدون باقة)، وهذا هو الوضع الصحيح عند الإطلاق.
*/
// Preview mode opens every page without a session: development builds only.
const PREVIEW = import.meta.env.DEV && import.meta.env.VITE_PREVIEW === "true";

const GUIDE_START_SEEN_KEY = "grad.guide.start.seen";

function hasSeenStartGuide() {
  try {
    return window.sessionStorage.getItem(GUIDE_START_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markStartGuideSeen() {
  try {
    window.sessionStorage.setItem(GUIDE_START_SEEN_KEY, "1");
  } catch {
    /* التخزين غير متاح */
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;

  const [pendingPayments, setPendingPayments] = useState(0);
  usePageMeta({ path: pathname });

  // العدّاد الموحّد: طلبات الدفع بانتظار المراجعة في كل الحفلات (stats/v2 → attention.processing)
  // نفس الرقم في شارة الشريط الجانبي وفي رأس صفحة طلبات الدفع — لا مصدر ثانٍ.
  const refreshPendingPayments = useCallback(async () => {
    try {
      const n = await fetchPendingPaymentsTotal();
      setPendingPayments(n);
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

  const hasValidGraduate = hasGraduateSession();
  const hasValidAdmin = hasAdminSession();
  const hasVerifySession = getVerificationToken();
  const hasValidRegistration = getRegistrationToken() && !isRegistrationTokenExpired();
  const adminName = getAdminUsername();

  useEffect(() => {
    if (hasValidAdmin) {
      refreshPendingPayments();
    }
  }, [pathname, hasValidAdmin, refreshPendingPayments]);

  // تحديث العدّاد كل 30 ثانية أثناء ظهور التبويب، وفوراً عند استعادة التركيز.
  // التنظيف يزيل المؤقّت والمستمعات حتى لا يبقى أي تسريب بعد الخروج من الجلسة.
  useEffect(() => {
    if (!hasValidAdmin) return undefined;
    const tick = () => {
      if (document.visibilityState === "visible") refreshPendingPayments();
    };
    const timer = setInterval(tick, PENDING_PAYMENTS_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [hasValidAdmin, refreshPendingPayments]);

  return (
    <AdminStatsProvider pendingPayments={pendingPayments} refreshPendingPayments={refreshPendingPayments}>
      <Suspense fallback={<PageSkeleton />}>
      <PageTransition>
      <Routes>
        {/* ===== التسجيل ===== */}
        <Route
          path="/"
          element={
            hasVerifySession && !PREVIEW ? (
              // the account is created and waits for its code: there is nothing to go back to
              <Navigate to="/otp" replace />
            ) : hasSeenStartGuide() ? (
              <GraduationFormStep1
                onNavigateToLogin={() => navigate("/login")}
                onNext={() => navigate("/register")}
              />
            ) : (
              <Navigate to="/guide/start" replace />
            )
          }
        />

        <Route
          path="/register"
          element={
            hasVerifySession && !PREVIEW ? (
              <Navigate to="/otp" replace />
            ) : hasValidRegistration || PREVIEW ? (
              <GraduationFormStep2
                onBack={() => navigate("/")}
                onNavigateToLogin={() => navigate("/login")}
                onNext={() => {
                  navigate("/otp", { replace: true }); // the form is not a step to come back to
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
                onDone={() => {
                  navigate("/tickets", { replace: true }); // الحارس يعرض دليل الباقة أولاً
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
              // بعد الدخول: الحارس يوجّهه لصفحة مرحلته، ويعرض دليلها إن لم يقرأه
              onLoginSuccess={(info) => {
                // حساب غير مؤكد: الباك رجّع 403 مع رمز تحقق جديد ولم يعطِ جلسة دخول،
                // فنرجّعه لصفحة الـ OTP ليكمل التأكيد (أو يعيد الإرسال / يغيّر البريد).
                if (info?.needsVerification) {
                  navigate("/otp", { replace: true });
                  return;
                }
                navigate("/tickets", { replace: true });
              }}
              onForgotPassword={async (em) => {
                await forgotPassword(em);
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

        {/* ===== الإدارة: تُفتح من الرابط /admin فقط، ولا يوجد أي رابط إليها في صفحات الطلاب ===== */}
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
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== الكليات والاختصاصات ===== */}
        <Route
          path="/admin/colleges"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminColleges
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onLogout={handleAdminLogout}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* ===== ملفات البيانات ===== */}
        <Route
          path="/admin/files"
          element={
            hasValidAdmin || PREVIEW ? (
              <AdminUniversityFiles
                adminName={adminName}
                onNavigate={(section) => navigate(`/admin/${section}`)}
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

        {/* ===== الماسح: تُفتح من الرابط /scanner فقط، ولا يوجد أي رابط إليها في صفحات الطلاب ===== */}
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
            hasScannerSession() ? (
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
            (hasScannerSession()) || PREVIEW ? (
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
            (hasScannerSession()) || PREVIEW ? (
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
            (hasScannerSession()) || PREVIEW ? (
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
            (hasScannerSession()) || PREVIEW ? (
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

        <Route
          path="/guide/start"
          element={
            <GraduateGuide
              phase="before"
              onContinue={() => {
                markStartGuideSeen();
                navigate("/");
              }}
            />
          }
        />
        <Route path="/guide/:stage" element={<StageGuide />} />
        <Route path="/guide" element={<Navigate to="/tickets" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </PageTransition>
      </Suspense>
    </AdminStatsProvider>
  );
}

export default App;
