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
import Login from "./pages/student/Login";
import ResetPassword from "./pages/student/ResetPassword";
import SelectTicket from "./pages/student/SelectTicket";
import ShamCashPayment from "./pages/student/ShamCashPayment";
import OrderStatus from "./pages/student/OrderStatus";
import OrderRejected from "./pages/student/OrderRejected";
import MyTicket from "./pages/student/MyTicket";

/*
  وضع المعاينة (للتصميم فقط):
  true  = أي صفحة بتفتح مباشرة من شريط العنوان بدون شروط، بقيم تجريبية.
  false = الشروط شغالة (مثلاً الدفع لا يُفتح بدون باقة)، وهذا هو الوضع الصحيح عند الإطلاق.
*/
const PREVIEW = true;

/* حالة بتنحفظ بـ sessionStorage، فبتضل موجودة بعد تحديث الصفحة (وبتنمسح بإغلاق التبويب) */
function usePersistentState(key, initialValue) {
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

  const [email, setEmail] = usePersistentState("grad.email", ""); // بريد التسجيل
  const [resetEmail, setResetEmail] = usePersistentState("grad.resetEmail", ""); // بريد استعادة كلمة السر
  const [ticket, setTicket] = usePersistentState("grad.ticket", null); // الباقة المختارة
  const [payment, setPayment] = usePersistentState("grad.payment", null); // بيانات تحويل شام كاش
  const [resetVerified, setResetVerified] = useState(false); // هل تأكد رمز الاستعادة؟ (ما منحفظها)

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Routes>
      {/* ===== التسجيل ===== */}
      <Route
        path="/"
        element={<GraduationFormStep1 onNext={() => navigate("/register")} />}
      />

      <Route
        path="/register"
        element={
          <GraduationFormStep2
            onBack={() => navigate("/")}
            onNavigateToLogin={() => navigate("/login")}
            onNext={(data) => {
              setEmail(data.email);
              navigate("/otp");
            }}
          />
        }
      />

      <Route
        path="/otp"
        element={
          // بدون بريد (فتح مباشر) نرجعه للتسجيل
          email || PREVIEW ? (
            <Otp
              mode="register"
              email={email || undefined}
              onBack={() => navigate("/register")}
              onVerified={() => navigate("/tickets")}
            />
          ) : (
            <Navigate to="/register" replace />
          )
        }
      />

      {/* ===== تسجيل الدخول ===== */}
      <Route
        path="/login"
        element={
          <Login
            initialEmail={resetEmail}
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
              setResetVerified(false);
              navigate("/reset-otp");
            }}
          />
        }
      />

      {/* ===== استعادة كلمة السر: رمز التحقق ثم كلمة سر جديدة ===== */}
      <Route
        path="/reset-otp"
        element={
          resetEmail || PREVIEW ? (
            <Otp
              mode="reset"
              email={resetEmail || undefined}
              onBack={() => navigate("/login")}
              onVerified={() => {
                setResetVerified(true);
                navigate("/reset-password");
              }}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/reset-password"
        element={
          // لا يدخلها أحد إلا بعد تأكيد الرمز
          resetVerified || PREVIEW ? (
            <ResetPassword
              onBack={() => navigate("/login")}
              onDone={() => {
                setResetVerified(false);
                navigate("/login", { state: { passwordReset: true } });
              }}
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
            onContinue={(data) => {
              setTicket(data);
              navigate("/payment");
            }}
          />
        }
      />

      <Route
        path="/payment"
        element={
          // لا ندخل صفحة الدفع بدون باقة محددة
          ticket || PREVIEW ? (
            <ShamCashPayment
              amount={ticket?.price}
              onBack={() => navigate("/tickets")}
              onSuccess={(data) => {
                setPayment({ ...data, submittedAt: new Date().toISOString() });
                // replace: حتى لا يرجع المستخدم لصفحة الدفع بزر الرجوع بالمتصفح
                navigate("/payment-submitted", { replace: true });
              }}
            />
          ) : (
            <Navigate to="/tickets" replace />
          )
        }
      />

      <Route
        path="/payment-submitted"
        element={
          // لا نعرض حالة الطلب إلا بعد إرسال بيانات الدفع
          payment || PREVIEW ? (
            <OrderStatus
              transactionId={payment?.transactionId}
              amountPaid={payment?.transferAmount}
              orderDate={payment?.submittedAt}
            />
          ) : (
            <Navigate to="/tickets" replace />
          )
        }
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

      {/* ===== تذكرتي: بعد قبول الدفع (البيانات الحقيقية بتجي من السيرفر لاحقاً) ===== */}
      <Route
        path="/my-ticket"
        element={<MyTicket onBack={() => navigate("/tickets")} />}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;