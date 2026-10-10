import React, { useState } from 'react';
import '../../style/Login.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const validators = {
  email: (v) => {
    const t = v.trim();
    if (!t) return 'يرجى إدخال البريد الإلكتروني';
    if (!EMAIL.test(t)) return 'صيغة البريد الإلكتروني غير صحيحة';
    return '';
  },
  password: (v) => (v ? '' : 'يرجى إدخال كلمة السر'),
};

/* معرّف كل حقل، لنرجّع الفوكس لأول حقل فيه خطأ */
const fieldIds = {
  email: 'student-email',
  password: 'student-password',
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="lg-error-text" role="alert">
      {message}
    </p>
  );
}

export default function Login({
  onLoginSuccess,
  onNavigateToRegister,
  onForgotPassword,
  onBack,
  initialEmail = '',
  notice = '',
}) {
  const [formData, setFormData] = useState({ email: initialEmail, password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  // الحقول اللي صار لها فحص (الأخطاء ما بتبين إلا بعد الضغط على الزر)
  const [checked, setChecked] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // بعد فحص الحقل، الخطأ بيتحدّث مباشرة أثناء الكتابة
    if (checked[name]) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const newErrors = {};
    Object.keys(validators).forEach((name) => {
      newErrors[name] = validators[name](formData[name]);
    });
    setErrors(newErrors);
    setChecked({ email: true, password: true });

    // إذا في أي خطأ: وقّف وروح لأول حقل فيه خطأ
    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    const credentials = { email: formData.email.trim(), password: formData.password };
    if (onLoginSuccess) onLoginSuccess(credentials);
    else alert(`تم تسجيل الدخول بنجاح للبريد: ${credentials.email}`);
  };

  // نسيت كلمة السر: نحتاج البريد أولاً لنرسل له رمز الاستعادة
  const handleForgot = (e) => {
    e.preventDefault();
    const t = formData.email.trim();
    const emailError = !t
      ? 'يرجى إدخال بريدك الإلكتروني أولاً لإرسال رمز الاستعادة'
      : validators.email(t);

    setChecked((prev) => ({ ...prev, email: true }));
    setErrors((prev) => ({ ...prev, email: emailError }));

    if (emailError) {
      document.getElementById(fieldIds.email)?.focus();
      return;
    }
    if (onForgotPassword) onForgotPassword(t);
  };

  return (
    <div className="lg-app-container">
      <main className="lg-mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
        <header className="lg-header-main">
          <div className="lg-header-top">
            <button
              aria-label="رجوع"
              className="lg-icon-btn"
              type="button"
              onClick={() => (onBack ? onBack() : window.history.back())}
            >
              <span className="lg-symbol">arrow_forward</span>
            </button>

            <h1 className="lg-header-title">حفل تخرج جامعة حمص</h1>

            <div className="lg-icon-btn static">
              <img className="lg-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="lg-header-subband">
            <span className="lg-subband-title">تسجيل الدخول</span>
            <span className="lg-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* محتوى البطاقة الرئيسي */}
        <div className="lg-main-stage">
          <section className="lg-ticket-card">
            {notice && (
              <div className="lg-notice" role="status">
                <span className="lg-symbol">check_circle</span>
                <span>{notice}</span>
              </div>
            )}

            <div className="lg-card-header">
              <div className="lg-logo-wrapper">
                <img src={universityLogo} alt="شعار جامعة حمص" className="lg-logo-img" />
              </div>

              <h2 className="lg-card-headline">أهلاً بعودتك</h2>
              <p className="lg-card-subtext">
                سجّل دخولك لمتابعة حجز تذكرتك واستكمال بيانات الدخول إلى الحفل
              </p>
            </div>

            {/* نموذج تسجيل الدخول */}
            <form className="lg-form" onSubmit={handleSubmit} noValidate>
              {/* حقل البريد الإلكتروني */}
              <div className="lg-field-group">
                <label className="lg-label" htmlFor="student-email">
                  البريد الإلكتروني
                </label>
                <div className={`lg-input-wrapper ${errors.email ? 'error' : ''}`}>
                  <div className="lg-input-icon-right">
                    <span className="lg-symbol">mail</span>
                  </div>
                  <input
                    id="student-email"
                    name="email"
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    dir="ltr"
                    className="lg-input"
                    placeholder="student@albaath-univ.edu.sy"
                    value={formData.email}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.email}
                  />
                </div>
                <FieldError message={errors.email} />
              </div>

              {/* حقل كلمة السر */}
              <div className="lg-field-group">
                <div className="lg-field-header">
                  <label className="lg-label" htmlFor="student-password">
                    كلمة السر
                  </label>
                  <a href="#forgot" className="lg-forgot-link" onClick={handleForgot}>
                    نسيت كلمة السر؟
                  </a>
                </div>
                <div className={`lg-input-wrapper ${errors.password ? 'error' : ''}`}>
                  <div className="lg-input-icon-right">
                    <span className="lg-symbol">lock</span>
                  </div>
                  <input
                    id="student-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    dir="ltr"
                    className="lg-input has-left-icon"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.password}
                  />
                  {/* القفل بالأيمن دائماً، والعين بتظهر على اليسار أول ما تكتب */}
                  {formData.password && (
                    <button
                      type="button"
                      className="lg-input-icon-left"
                      aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      <span className="lg-symbol">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  )}
                </div>
                <FieldError message={errors.password} />
              </div>

              {/* زر التقديم */}
              <button className="lg-submit-btn" type="submit">
                <span>دخول</span>
                <span className="lg-symbol">arrow_back</span>
              </button>
            </form>

            <div className="lg-divider-text">خطوة واحدة وتصبح تذكرتك معك</div>

            <div className="lg-register-prompt">
              ليس لديك حساب؟{' '}
              <a
                href="#register"
                className="lg-register-link"
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigateToRegister) onNavigateToRegister();
                }}
              >
                أنشئ حسابك الآن
              </a>
            </div>
          </section>

          {/* تذييل الصفحة */}
          <footer className="lg-footer">
            <p className="lg-footer-org">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
            <p className="lg-footer-copy">منظومة الحجز والتحقق الإلكتروني لتذاكر التخرج © 2026</p>
          </footer>
        </div>
      </main>
    </div>
  );
}