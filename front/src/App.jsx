import { useState, useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import GraduationFormStep1 from "./pages/student/GraduationFormStep1";
import GraduationFormStep2 from "./pages/student/GraduationFormStep2";
import Otp from "./pages/student/Otp";
import GraduateQuestions from "./pages/student/GraduateQuestions";
import Login from "./pages/student/Login";
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
import { getScannerToken, isScannerTokenExpired, clearScannerSession, getGraduateToken, isGraduateTokenExpired, getAdminToken, isAdminTokenExpired, getVerificationToken, getRegistrationToken, isRegistrationTokenExpired, getResetEmail, setResetEmail, getResetCode, getGraduateEmail } from "./api/session";

/*
  وضع المعاينة (للتصميم فقط):
  true  = أي صفحة بتفتح مباشرة من شريط العنوان بدون شروط، بقيم تجريبية.
  false = الشروط شغالة (مثلاً الدفع لا يُفتح بدون باقة)، وهذا هو الوضع الصحيح عند الإطلاق.
*/
const PREVIEW = import.meta.env.VITE_PREVIEW === 'true';



/* حالة بتنحفظ بـ sessionStorage، فبتضل موجودة بعد تحديث الصفحة (وبتنمسح بإغلاق التبويب) */function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch (err) {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (value === null || value === undefined || value === "") {
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, JSON.stringify(value));
      }
    } catch (err) {
      /* التخزين غير متاح: نكمل بدونه */
    }
  }, [key, value]);

  return [value, setValue];
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;




  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const hasValidGraduate = getGraduateToken() && !isGraduateTokenExpired();
  const hasValidAdmin = getAdminToken() && !isAdminTokenExpired();
  const hasVerificationToken = !!getVerificationToken();
  const hasValidRegistration = getRegistrationToken() && !isRegistrationTokenExpired();

  return (
    <AdminStatsProvider>
      <Routes>
        {/* ===== التسجيل ===== */}
        <Route
          path="/"
          element={
            <GraduationFormStep1
                onNext={() => {
                  navigate("/register");
                }}
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
            hasVerificationToken || PREVIEW ? (
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

        {/* ===== بعد تأكيد البريد: سؤالان عن المسؤولية والخبرة، ثم اختيار التذكرة ===== */}
        <Route
          path="/questions"
          element={
            hasValidGraduate || PREVIEW ? (
              <GraduateQuestions
                onDone={() => {
                  navigate("/tickets", { replace: true });
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
              onLoginSuccess={() => navigate("/tickets")}
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
            (getResetEmail() && getResetCode()) || PREVIEW ? (
              <ResetPassword
                onBack={() => navigate("/login")}
                onDone={() => navigate("/login", { state: { passwordReset: true } })}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* ===== بعد الدخول: اختيار التذكرة ثم الدفع ===== */}
        <Route
          path="/tickets"
          element={
            <SelectTicket
              onBack={() => navigate("/login")}
              onContinue={() => navigate("/payment")}
            />
          }
        />

        <Route
          path="/payment"
          element={
            <ShamCashPayment
              onBack={() => navigate("/tickets")}
              onSuccess={() => navigate("/payment-submitted", { replace: true })}
            />
          }
        />

        <Route
          path="/payment-submitted"
          element={<OrderStatus />}
        />

        {/* صفحة الرفض ما بتحتاج بيانات، والزر بيرجع المستخدم للدفع (وهناك الشرط) */}
        <Route
          path="/payment-rejected"
          element={
            <OrderRejected
              onResubmit={() => navigate("/payment", { replace: true })}
            />
          }
        />

        {/* ===== التذكرة بعد تأكيد الدفع ===== */}
        <Route
          path="/my-ticket"
          element={<MyTicket />}
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
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onLogout={() => navigate("/admin", { replace: true })}
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
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddCeremony={() => navigate("/admin/ceremonies/new")}
                onEditCeremony={(item) =>
                  navigate(`/admin/ceremonies/${item.id}/edit`, {
                    state: { ceremony: item },
                  })
                }
                onLogout={() => navigate("/admin", { replace: true })}
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
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onCancel={() => navigate("/admin/ceremonies")}
                onSubmitSuccess={() => navigate("/admin/ceremonies")}
                onLogout={() => navigate("/admin", { replace: true })}
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
              location.state?.ceremony ? (
                <AdminAddCeremony
                  key={location.state.ceremony.id}
                  ceremony={{
                    id: location.state.ceremony.id,
                    ...location.state.ceremony.form,
                  }}
                  onNavigate={(section) => navigate(`/admin/${section}`)}
                  onCancel={() => navigate("/admin/ceremonies")}
                  onSubmitSuccess={() => navigate("/admin/ceremonies")}
                  onLogout={() => navigate("/admin", { replace: true })}
                />
              ) : (
                <Navigate to="/admin/ceremonies" replace />
              )
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
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={() => navigate("/admin", { replace: true })}
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
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={() => navigate("/admin", { replace: true })}
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
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={() => navigate("/admin", { replace: true })}
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
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={() => navigate("/admin", { replace: true })}
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

        {/* ===== شاشة المسح ===== */}
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
        <Route
          path="/scanner/error"
          element={
            (getScannerToken() && !isScannerTokenExpired()) || PREVIEW ? (
              <ScanErrorResult preview={PREVIEW} onNextScan={() => navigate("/scanner/scan")} />
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

        {/* أي مسار ماسح غير معرّف: ارجع لشاشة المسح */}
        <Route
          path="/scanner/*"
          element={<Navigate to="/scanner/scan" replace />}
        />

        {/* اختصار: /dashboard يودّي للوحة الإدارة */}
        <Route
          path="/dashboard"
          element={<Navigate to="/admin/dashboard" replace />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminStatsProvider>
  );
}

export default App;