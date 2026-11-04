import StageHeader from '../../components/StageHeader';
import React, { useState } from "react";
import "../../style/GraduationForm.css";
import '../../style/BrandHeader.css';
import universityLogo from "../../assets/homs-university-white.png";
import useFormDraft from "../../hooks/useFormDraft";
import { registerStep2 } from "../../api/graduate";
import { setVerificationToken, setGraduateEmail, clearRegistrationToken, getRegistrationToken } from "../../api/session";
import { phoneError, passwordError } from "../../utils/validators";
import { cleanServerMessage } from "../../utils/cleanServerMessage.js";
import { CEREMONY_TITLE } from '../../config/brand';
import GraduateFooter from '../../components/GraduateFooter';

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
  const [unverifiedNotice, setUnverifiedNotice] = useState('');

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

  // a field is judged when he leaves it (an untouched empty one is left alone)
  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (!validators[name]) return;
    if (!submitted && String(value).trim() === "") return;
    setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
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
    setUnverifiedNotice('');
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
        const cleaned = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) cleaned[k] = cleanServerMessage(v);
        setErrors((prev) => ({ ...prev, ...cleaned }));
        const firstField = Object.keys(cleaned)[0];
        document.getElementById(fieldIds[firstField])?.focus();
      } else if (err.status === 401) {
        setErrors({ general: err.message || 'انتهت الجلسة، يرجى إعادة الخطوة الأولى' });
      } else if (err.status === 400 || err.status === 403) {
        const detail = err.data?.detail;
        const code = detail && typeof detail === 'object' ? detail.code : null;
        if (code === 'ACCOUNT_UNVERIFIED') {
          setUnverifiedNotice(err.message);
          setErrors({});
        } else {
          setErrors({ general: err.message });
        }
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
        <StageHeader current="register" guide="before" sub="الخطوة 2 من 4 · معلومات الحساب والأمان" onBack={onBack} />


        {/* بطاقة النموذج */}
        <div className="form-card">
          <div className="card-header">
            <div className="logo-circle">
              <img src={universityLogo} alt="شعار جامعة حمص" />
            </div>
            <div>
              <h2 className="card-title">بيانات الدخول والأمان</h2>
              <p className="card-subtitle">{CEREMONY_TITLE}</p>
            </div>
          </div>

          {notice && (
            <div className="info-box" style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined info-icon">info</span>
              <p className="info-text">{notice}</p>
            </div>
          )}
                    {unverifiedNotice && (
            <div className="info-box" style={{ marginBottom: 12 }} role="status">
              <span className="material-symbols-outlined info-icon">info</span>
              <div>
                <p className="info-text">{unverifiedNotice}</p>
                <button
                  type="button"
                  className="login-link-btn"
                  style={{ marginTop: 8 }}
                  onClick={onNavigateToLogin}
                >
                  لدي حساب
                </button>
              </div>
            </div>
          )}
{errors.general && (
            <div className="info-box" role="alert" style={{ marginBottom: 12, borderColor: '#ba1a1a', background: '#fff5f5' }}>
              <p className="info-text" style={{ color: '#ba1a1a' }}>{errors.general}</p>
            </div>
          )}

          {/* autoComplete="off": المتصفح ما يعبي الحقول لحاله */}
          <form
            onSubmit={handleSubmit}
            onBlur={handleBlur}
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
              </div>
              <FieldError message={errors.phone} />
              <p className="label-hint" style={{ marginTop: "4px" }}>
                هذا الرقم هو رقم واتساب للتواصل معك عند الحاجة
              </p>
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
                  placeholder="student@gmail.com"
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
              <div className="info-box password-scope-note" role="note">
                <span className="material-symbols-outlined info-icon">key</span>
                <p className="info-text">
                  كلمة سر جديدة لحسابك على منصة الحفل، وليست كلمة سر بريدك الإلكتروني.
                  <strong> (تستخدمها لاحقاً لتسجيل الدخول إلى الموقع).</strong>
                </p>
              </div>
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
        <GraduateFooter />
      </main>
    </div>
  );
}