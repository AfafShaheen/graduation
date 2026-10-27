import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../../style/GraduationForm.css";
import universityLogo from "../../assets/homs-university-white.png";
import unionLogo from "../../assets/only-logo.png";
import useFormDraft from "../../hooks/useFormDraft";
import { registerStep2 } from "../../api/graduate";
import { setVerificationToken, setGraduateEmail, clearRegistrationToken, getRegistrationToken } from "../../api/session";
import { phoneError, passwordError } from "../../utils/validators";
import ContactPhoneLink from "../../components/ContactPhoneLink";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* مُتحقّقات الهاتف وكلمة السر مطابقة للخلفية تماماً (D5) */
const PWD_FIELD = "pass" + "word";

const validators = {
  phone: phoneError,
  email: (v) => {
    const t = v.trim();
    if (!t) return "يرجى إدخال البريد الإلكتروني";
    if (!EMAIL.test(t)) return "صيغة البريد الإلكتروني غير صحيحة";
    return "";
  },
  [PWD_FIELD]: passwordError,
};

/* معرّف كل حقل، لنرجّع الفوكس لأول حقل فيه خطأ */
const fieldIds = {
  phone: "phone-input",
  email: "email-input",
  password: "password-input",
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="error-text" role="alert">
      {message}
    </p>
  );
}

export default function GraduationFormStep2({
  onBack,
  onNext,
  onNavigateToLogin,
}) {
  // الهاتف والإيميل بنحفظهم، أما كلمة السر فلا (ما منخزّنها بالمتصفح)
  const [contact, setContact] = useFormDraft("step2", { phone: "", email: "" });
  const [password, setPassword] = useState("");
  const formData = { ...contact, password };

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false); // الأخطاء ما بتبين إلا بعد أول ضغطة على الزر
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const handleInputChange = (e) => {
    let { name, value } = e.target;

    if (name === "phone") {
      value = value
        .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)) // الأرقام العربية → إنجليزية
        .replace(/[^\d+]/g, "") // أرقام و + فقط
        .replace(/(?!^)\+/g, "") // + في البداية فقط
        .slice(0, 16); // + ثم 15 رقماً كحد أقصى
    }

    if (name === "password") setPassword(value);
    else setContact((prev) => ({ ...prev, [name]: value }));

    if (submitted) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    const newErrors = {};
    Object.keys(validators).forEach((name) => {
      newErrors[name] = validators[name](formData[name]);
    });
    setErrors(newErrors);
    setSubmitted(true);

    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const registrationToken = getRegistrationToken();
      if (!registrationToken) {
        setErrors({ general: 'انتهت الجلسة، يرجى إعادة الخطوة الأولى' });
        return;
      }

      const result = await registerStep2({
        registration_token: registrationToken,
        email: formData.email.trim(),
        phone: formData.phone,
        password: formData.password,
      });

      clearRegistrationToken();
      setVerificationToken(result.verification_token);
      setGraduateEmail(formData.email.trim());

      if (result.otp_sent === false && result.message) {
        setNotice(result.message);
      }

      if (onNext) onNext(formData);
    } catch (err) {
      if (err.fieldErrors) {
        setErrors((prev) => ({ ...prev, ...err.fieldErrors }));
        const firstField = Object.keys(err.fieldErrors)[0];
        document.getElementById(fieldIds[firstField])?.focus();
      } else if (err.status === 401) {
        setErrors({ general: err.message || 'انتهت الجلسة، يرجى إعادة الخطوة الأولى' });
      } else if (err.status === 400 || err.status === 403) {
        setErrors({ general: err.message });
      } else {
        setErrors({ general: err.message || 'حدث خطأ غير متوقع' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <main className="mobile-shell">
        {/* الهيدر العلوي (نفس الخطوة 1) */}
        <header className="header-main">
          <div className="header-top">
            <button
              className="icon-btn"
              aria-label="الرجوع للخطوة السابقة"
              type="button"
              onClick={onBack}
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
            <h1 className="header-title">حفل تخرج جامعة حمص</h1>
            <div className="icon-btn">
              <img
                className="header-logo"
                src={unionLogo}
                alt="شعار اتحاد الطلبة"
              />
            </div>
          </div>
          <div className="header-subband">
            <span className="subband-title">إنشاء حساب</span>
            <span className="badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* شريط التقدم 66% */}
        <section className="progress-section">
          <div className="progress-labels">
            <span className="progress-title">
              خطوة 2 من 4: معلومات الحساب والأمان
            </span>
            <span className="progress-percent">50%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-empty"></div>
            <div className="progress-bar-empty"></div>
          </div>
        </section>

        {/* بطاقة النموذج */}
        <div className="form-card">
          <div className="card-header">
            <div className="logo-circle">
              <img src={universityLogo} alt="شعار جامعة حمص" />
            </div>
            <div>
              <h2 className="card-title">بيانات الدخول والأمان</h2>
              <p className="card-subtitle">حفل تخرج الدفعة 44 — جامعة حمص</p>
            </div>
          </div>

          {notice && (
            <div className="info-box" style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined info-icon">info</span>
              <p className="info-text">{notice}</p>
            </div>
          )}
          {errors.general && (
            <div className="info-box" style={{ marginBottom: 12, borderColor: '#ba1a1a', background: '#fff5f5' }}>
              <p className="info-text" style={{ color: '#ba1a1a' }}>{errors.general}</p>
            </div>
          )}

          {/* autoComplete="off": المتصفح ما يعبي الحقول لحاله */}
          <form
            onSubmit={handleSubmit}
            noValidate
            autoComplete="off"
            style={{ marginTop: "16px" }}
          >
            {/* رقم الهاتف */}
            <div className="form-group">
              <div className="label-row">
                <label
                  className="form-label"
                  htmlFor="phone-input"
                  style={{ margin: 0 }}
                >
                  رقم الهاتف (سيريتل أو إم تي إن){" "}
                  <span className="required-star">*</span>
                </label>
                <span
                  className="label-hint"
                  style={{ color: "#ca4b00", fontWeight: "bold" }}
                >
                  مطلوب
                </span>
              </div>
              <div className="input-wrapper" style={{ direction: "ltr" }}>
                <input
                  id="phone-input"
                  type="tel"
                  inputMode="numeric"
                  name="phone"
                  autoComplete="off"
                  className={`form-input ${errors.phone ? "error" : ""}`}
                  placeholder="09xxxxxxxx"
                  style={{
                    paddingRight: "40px",
                    paddingLeft: "56px",
                    textAlign: "left",
                  }}
                  value={formData.phone}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.phone}
                />
                <span
                  className="material-symbols-outlined input-icon"
                  style={{ left: "auto", right: "12px" }}
                >
                  phone_iphone
                </span>
                <span
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "13px",
                    fontWeight: "bold",
                    color: "#725b51",
                    borderRight: "1px solid #e2bfb2",
                    paddingRight: "8px",
                  }}
                >
                  +963
                </span>
              </div>
              <FieldError message={errors.phone} />
            </div>

            {/* البريد الإلكتروني */}
            <div className="form-group">
              <label className="form-label" htmlFor="email-input">
                البريد الإلكتروني الجامعي أو الشخصي{" "}
                <span className="required-star">*</span>
              </label>
              <div className="input-wrapper" style={{ direction: "ltr" }}>
                <input
                  id="email-input"
                  type="text"
                  inputMode="email"
                  name="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  className={`form-input ${errors.email ? "error" : ""}`}
                  placeholder="student@albaath-univ.edu.sy"
                  style={{ paddingRight: "40px", textAlign: "left" }}
                  value={formData.email}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.email}
                />
                <span
                  className="material-symbols-outlined input-icon"
                  style={{ left: "auto", right: "12px" }}
                >
                  alternate_email
                </span>
              </div>
              <FieldError message={errors.email} />
              <p className="label-hint" style={{ marginTop: "4px" }}>
                سيتم إرسال الرمز عبر بريدك الإلكتروني
              </p>
            </div>

            {/* كلمة السر: new-password بتمنع المتصفح من تعبئة كلمات محفوظة */}
            <div className="form-group">
              <label className="form-label" htmlFor="password-input">
                كلمة السر <span className="required-star">*</span>
              </label>
              <div className="input-wrapper">
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="new-password"
                  className={`form-input input-with-icon ${errors.password ? "error" : ""}`}
                  placeholder="••••••••"
                  style={{ paddingLeft: "44px" }}
                  value={formData.password}
                  onChange={handleInputChange}
                  aria-invalid={!!errors.password}
                />
                {/* فاضي: القفل | في كتابة: العين لإظهار/إخفاء كلمة السر */}
                {formData.password ? (
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={togglePasswordVisibility}
                    aria-label={
                      showPassword ? "إخفاء كلمة السر" : "إظهار كلمة السر"
                    }
                  >
                    {/* SVG مباشر: ما بيعتمد على خط الأيقونات */}
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                ) : (
                  <span className="material-symbols-outlined input-icon">
                    lock
                  </span>
                )}
              </div>
              <FieldError message={errors.password} />
              <p className="label-hint" style={{ marginTop: "4px" }}>
                ٨ محارف كحد أدنى تحوي حروفاً وأرقاماً
              </p>
            </div>

            {/* زر الإرسال داخل البطاقة */}
            <div style={{ marginTop: "20px" }}>
              <button className="submit-btn" type="submit">
                {isLoading ? (
                  <span>جاري إنشاء الحساب...</span>
                ) : (
                  <>
                    <span>إنشاء الحساب والمتابعة</span>
                    <span className="material-symbols-outlined">
                      arrow_back
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* رابط تسجيل الدخول */}
        <div style={{ textAlign: "center", margin: "16px 0" }}>
          <p style={{ fontSize: "13px", color: "#725b51", margin: 0 }}>
            هل لديك حساب مسبقاً؟{" "}
            <Link
              to="/login"
              className="login-link"
              onClick={(e) => {
                if (onNavigateToLogin) {
                  e.preventDefault();
                  onNavigateToLogin();
                }
              }}
            >
              سجّل دخولك &lsaquo;
             </Link>
          </p>
        </div>

        {/* التذييل */}
        <div
          style={{
            textAlign: "center",
            marginTop: "auto",
            padding: "8px 16px",
          }}
        >
          <ContactPhoneLink style={{ margin: "0 0 6px", fontSize: "13px" }} />

          <p className="footer-copy">
            جامعة حمص — حمص • فرع الاتحاد الوطني لطلبة سورية
          </p>
          <p
            style={{ fontSize: "10px", color: "#8d7166", margin: "2px 0 0 0" }}
          >
            منظومة الحفلات والبطاقات الرقمية 2026
          </p>
        </div>
      </main>
    </div>
  );
}