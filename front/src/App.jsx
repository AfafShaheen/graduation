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

function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [email, setEmail] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Routes>
      <Route
        path="/"
        element={<GraduationFormStep1 onNext={() => navigate("/register")} />}
      />

      <Route
        path="/register"
        element={
          <GraduationFormStep2
            onBack={() => navigate("/")}
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
          <Otp
            email={email}
            onBack={() => navigate("/register")}
            onVerified={() => navigate("/next")}
          />
        }
      />

      <Route
        path="/next"
        element={
          <div style={{ padding: 24, textAlign: "center", direction: "rtl" }}>
            الواجهة التالية (قيد الإنشاء)
          </div>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;