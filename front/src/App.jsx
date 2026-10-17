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
import { getScannerToken, isScannerTokenExpired, clearScannerSession } from "./api/session";

/*
  وضع المعاينة (للتصميم فقط):
  true  = أي صفحة بتفتح مباشرة من شريط العنوان بدون شروط، بقيم تجريبية.
  false = الشروط شغالة (مثلاً الدفع لا يُفتح بدون باقة)، وهذا هو الوضع الصحيح عند الإطلاق.
*/
const PREVIEW = import.meta.env.VITE_PREVIEW === 'true';

/* عدد طلبات الدفع المعلّقة (شارة القائمة الجانبية): مؤقت لحد ما يجهز الباك إند، بدّله بالقيمة الحقيقية */
const PENDING_PAYMENTS = 142;

/* أسماء الكليات حسب القيمة المخزنة بصفحة الخطوة 1 */
const FACULTY_LABELS = {
  it: "كلية الهندسة المعلوماتية",
  civil: "كلية الهندسة المدنية",
  med: "كلية الطب البشري",
  pharm: "كلية الصيدلة",
  dent: "كلية طب الأسنان",
  mech: "كلية الهندسة الميكانيكية",
  science: "كلية العلوم",
  arts: "كلية الآداب والعلوم الإنسانية",
};

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
  const [student, setStudent] = usePersistentState("grad.student", null); // بيانات الخريج: الاسم والكلية والتخصص والرقم الجامعي والترتيب والمعدل
  const [, setSurvey] = usePersistentState("grad.survey", null); // إجابات سؤالَي المسؤولية والخبرة
  const [resetVerified, setResetVerified] = useState(false); // هل تأكد رمز الاستعادة؟ (ما منحفظها)
  const [admin, setAdmin] = usePersistentState("grad.admin", null); // جلسة الإدارة (مؤقتة لحد ما يجهز الباك إند)
  const [adminError, setAdminError] = useState(""); // رسالة خطأ دخول الإدارة


  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <AdminStatsProvider pendingPayments={PENDING_PAYMENTS}>
      <Routes>
        {/* ===== التسجيل ===== */}
        <Route
          path="/"
          element={
            <GraduationFormStep1
              onNavigateToLogin={() => navigate("/login")}
              onNext={(data) => {
                // نحفظ بيانات الخريج (التذكرة + التخصص والترتيب والمعدل للباك إند)
                setStudent({
                  fullName: data.fullName.trim(),
                  faculty: data.faculty,
                  major: data.major, // "none" = لا يوجد
                  studentId: data.studentId.trim(),
                  topRank: data.topRank, // none | first | second | third
                  gpa: Number(data.gpa), // المعدل كنسبة مئوية (0-100)
                });
                navigate("/register");
              }}
            />
          }
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
            email || PREVIEW ? (
              <GraduateQuestions
                onDone={(answers) => {
                  setSurvey(answers); // { wantsResponsibility, hasExperience }
                  navigate("/tickets", { replace: true });
                }}
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
                  setPayment({
                    ...data,
                    submittedAt: new Date().toISOString(),
                  });
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

        {/* ===== التذكرة بعد تأكيد الدفع ===== */}
        <Route
          path="/my-ticket"
          element={
            ticket || PREVIEW ? (
              <MyTicket
                studentName={student?.fullName}
                faculty={FACULTY_LABELS[student?.faculty]}
                universityId={student?.studentId}
                companionsCount={ticket?.guestsCount}
                // gateAndSeat و ticketCode و qrSrc تأتي من الباك إند بعد قبول الدفع
              />
            ) : (
              <Navigate to="/tickets" replace />
            )
          }
        />

        {/* ===== الإدارة: بتنفتح من الرابط /admin فقط، وما في أي رابط إلها بصفحات الطلاب ===== */}
        <Route
          path="/admin"
          element={
            <AdminLogin
              errorMessage={adminError}
              onLoginSuccess={(credentials) => {
                // مؤقت: لما يجهز الباك إند، تحقق من البيانات هناك، وإذا فشل: setAdminError("بيانات الدخول غير صحيحة")
                setAdminError("");
                setAdmin({ username: credentials.syndicateId });
                navigate("/admin/dashboard");
              }}
            />
          }
        />

        <Route
          path="/admin/dashboard"
          element={
            admin || PREVIEW ? (
              <AdminDashboard
                adminName={admin?.username}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onLogout={() => {
                  setAdmin(null);
                  navigate("/admin", { replace: true });
                }}
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
            admin || PREVIEW ? (
              <AdminCeremonies
                adminName={admin?.username}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddCeremony={() => navigate("/admin/ceremonies/new")}
                onEditCeremony={(item) =>
                  navigate(`/admin/ceremonies/${item.id}/edit`, {
                    state: { ceremony: item },
                  })
                }
                onLogout={() => {
                  setAdmin(null);
                  navigate("/admin", { replace: true });
                }}
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
            admin || PREVIEW ? (
              <AdminAddCeremony
                adminName={admin?.username}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onCancel={() => navigate("/admin/ceremonies")}
                onSubmitSuccess={() => {
                  // مؤقت: لما يجهز الباك إند، أرسل بيانات الحفل (الوسيط) هناك قبل الرجوع
                  navigate("/admin/ceremonies");
                }}
                onLogout={() => {
                  setAdmin(null);
                  navigate("/admin", { replace: true });
                }}
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
            admin || PREVIEW ? (
              // بيانات الحفل بتوصل من صفحة الحفلات، وبدونها (فتح مباشر) نرجع للقائمة
              location.state?.ceremony ? (
                <AdminAddCeremony
                  key={location.state.ceremony.id}
                  ceremony={{
                    id: location.state.ceremony.id,
                    ...location.state.ceremony.form,
                  }}
                  adminName={admin?.username}
                  onNavigate={(section) => navigate(`/admin/${section}`)}
                  onCancel={() => navigate("/admin/ceremonies")}
                  onSubmitSuccess={() => {
                    // مؤقت: لما يجهز الباك إند، أرسل التعديلات (الوسيط) هناك قبل الرجوع
                    navigate("/admin/ceremonies");
                  }}
                  onLogout={() => {
                    setAdmin(null);
                    navigate("/admin", { replace: true });
                  }}
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
            admin || PREVIEW ? (
              <AdminPaymentRequests
                adminName={admin?.username}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                // onConfirmPayment و onRejectPayment: أرسل القرار للباك إند هون
                onLogout={() => {
                  setAdmin(null);
                  navigate("/admin", { replace: true });
                }}
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
            admin || PREVIEW ? (
              <AdminScannersSettings
                adminName={admin?.username}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                // onAddScanner, onToggleScannerFreeze, onChangeScannerPassword, onSaveSettings, onUploadQr: اربطها بالباك إند
                onLogout={() => {
                  setAdmin(null);
                  navigate("/admin", { replace: true });
                }}
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
            admin || PREVIEW ? (
              <AdminExceptions
                adminName={admin?.username}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                // onManualEntry, onCancelScan, onReturnToPending, onEditEmail: اربطها بالباك إند
                onLogout={() => {
                  setAdmin(null);
                  navigate("/admin", { replace: true });
                }}
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
            admin || PREVIEW ? (
              <AdminVolunteers
                adminName={admin?.username}
                onNavigate={(section) => navigate(`/admin/${section}`)}
                onAddTicket={() => navigate("/admin/ceremonies/new")}
                onLogout={() => {
                  setAdmin(null);
                  navigate("/admin", { replace: true });
                }}
              />
            ) : (
              <Navigate to="/admin" replace />
            )
          }
        />

        {/* أي مسار إدارة غير معرّف: مؤقتاً لحد ما يجهز */}
        <Route
          path="/admin/*"
          element={
            admin || PREVIEW ? (
              <div
                style={{ padding: 24, textAlign: "center", direction: "rtl" }}
              >
                هذه الصفحة قيد الإنشاء
                <br />
                <button
                  type="button"
                  onClick={() => navigate("/admin/dashboard")}
                >
                  العودة إلى لوحة التحكم
                </button>
              </div>
            ) : (
              <Navigate to="/admin" replace />
            )
          }
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