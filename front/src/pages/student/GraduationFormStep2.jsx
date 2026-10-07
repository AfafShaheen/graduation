import React, { useState } from "react";
import "../../style/GraduationForm.css";
import universityLogo from "../../assets/homs-university-white.png";
import unionLogo from "../../assets/only-logo.png";
import useFormDraft from "../../hooks/useFormDraft";

/* رقم سوري: 09 وبعدها 8 أرقام */
const PHONE = /^09[0-9]{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const validators = {
  phone: (v) => {
    const t = v.replace(/\s+/g, "");
    if (!t) return "يرجى إدخال رقم الهاتف";
    if (!/^[0-9]+$/.test(t)) return "يجب أن يكون رقم الهاتف أرقاماً فقط";
    if (!PHONE.test(t))
      return "يجب أن يبدأ رقم الهاتف بـ 09 وأن يتكون من 10 أرقام";
    return "";
  },
  email: (v) => {
    const t = v.trim();
    if (!t) return "يرجى إدخال البريد الإلكتروني";
    if (!EMAIL.test(t)) return "صيغة البريد الإلكتروني غير صحيحة";
    return "";
  },
  password: (v) => {
    if (!v) return "يرجى إدخال كلمة السر";
    if (v.length < 8) return "كلمة السر يجب أن تكون 8 محارف على الأقل";
    if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v))
      return "كلمة السر يجب أن تحتوي على حروف وأرقام";
    return "";
  },
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

export default function GraduationFormStep2({ onBack, onNext }) {
  // الهاتف والإيميل بنحفظهم، أما كلمة السر فلا (ما منخزّنها بالمتصفح)
  const [contact, setContact] = useFormDraft("step2", { phone: "", email: "" });
  const [password, setPassword] = useState("");
  const formData = { ...contact, password };

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false); // الأخطاء ما بتبين إلا بعد أول ضغطة على الزر
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    let { name, value } = e.target;

    if (name === "phone") {
      value = value
        .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)) // الأرقام العربية → إنجليزية
        .replace(/\D/g, "") // أرقام فقط
        .slice(0, 10); // 10 أرقام كحد أقصى
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading) return;

    const newErrors = {};
    Object.keys(validators).forEach((name) => {
      newErrors[name] = validators[name](formData[name]);
    });
    setErrors(newErrors);
    setSubmitted(true);

    // إذا في أي خطأ: وقّف وروح لأول حقل فيه خطأ
    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onNext) onNext(formData);
      else alert("تم إنشاء الحساب بنجاح!");
    }, 1000);
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
              خطوة 2 من 3: معلومات الحساب والأمان
            </span>
            <span className="progress-percent">66%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-fill"></div>
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
               سيتم ارسال الرمز عبر بريدك الالكترونيّ
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
            <a href="/login" className="login-link">
              سجّل دخولك &lsaquo;
            </a>
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
