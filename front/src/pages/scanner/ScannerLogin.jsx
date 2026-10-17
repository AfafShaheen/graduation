import React, { useState } from 'react';
import '../../style/ScannerLogin.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import { request } from '../../api/client';
import { setScannerSession } from '../../api/session';

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const validators = {
  username: (v) => (v.trim() ? '' : 'يرجى إدخال اسم المستخدم'),
  password: (v) => (v ? '' : 'يرجى إدخال كلمة السر'),
};

/* معرّف كل حقل، لنرجّع الفوكس لأول حقل فيه خطأ */
const fieldIds = {
  username: 'scanner-username',
  password: 'scanner-password',
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="scan-login-error-text" role="alert">
      {message}
    </p>
  );
}

/*
  onLoginSuccess: يُستدعى بعد اجتياز الفحص الشكلي ببيانات الدخول.
  errorMessage: رسالة خطأ من الباك إند (مثلاً: بيانات الدخول غير صحيحة أو الحساب مجمّد).
*/
export default function ScannerLogin({ onLoginSuccess, errorMessage = '' }) {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false); // الأخطاء ما بتبين إلا بعد أول ضغطة على الزر
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // بعد أول ضغطة على الزر، الخطأ بيتحدّث مباشرة أثناء الكتابة
    if (submitted) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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

    const credentials = { syndicateId: formData.username.trim(), password: formData.password };
    
    setLoading(true);
    setServerError('');
    try {
      const data = await request('/api/scanner/auth/login', {
        method: 'POST',
        body: { username: credentials.syndicateId, password: credentials.password },
      });
      setScannerSession({
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        event: data.event,
      });
      if (onLoginSuccess) onLoginSuccess({ username: credentials.syndicateId, event: data.event });
    } catch (err) {
      setServerError(
        err.status === 401
          ? 'بيانات الدخول غير صحيحة أو الحساب غير مفعّل'
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  const displayError = errorMessage || serverError;

  return (
    <div className="scan-login-app-container">
      <main className="scan-login-mobile-frame">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
        <header className="scan-login-header">
          <div className="scan-login-header-top">
            {/* مساحة فارغة لتبقى العنوان بالمنتصف */}
            <div className="scan-login-icon-slot" aria-hidden="true"></div>

            <h1 className="scan-login-header-title">حفل تخرج جامعة حمص</h1>

            <div className="scan-login-icon-slot">
              <img className="scan-login-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="scan-login-subband">
            <span className="scan-login-subband-title">
              <span className="scan-login-symbol" style={{ fontSize: '18px' }}>
                qr_code_scanner
              </span>
              ماسح التذاكر
            </span>
            <span className="scan-login-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* المحتوى الرئيسي */}
        <div className="scan-login-content-flow">
          {/* شريط معلومات الفرع */}
          <div className="scan-login-top-pill">
            <div className="scan-login-status-indicator">
              <span className="scan-login-dot"></span>
              <span className="scan-login-pill-main">فرع حمص لاتحاد الطلبة</span>
            </div>
            <span className="scan-login-pill-sub">بوابة الخريجين</span>
          </div>

          {/* بطاقة نموذج تسجيل الدخول */}
          <section className="scan-login-card">
            <div className="scan-login-logo-wrapper">
              <img src={universityLogo} alt="شعار جامعة حمص" />
            </div>

            <div className="scan-login-titles">
              <h2>بوابة الدخول — ماسح التذاكر</h2>
              <p>سجّل دخولك باسم الحساب المخصص لبوابتك</p>
            </div>

            <form className="scan-login-form" onSubmit={handleSubmit} noValidate autoComplete="off">
              {displayError && (
                <div className="scan-login-form-alert" role="alert">
                  <span className="scan-login-symbol" style={{ fontSize: '18px' }}>
                    error
                  </span>
                  <span>{displayError}</span>
                </div>
              )}

              {/* حقل اسم المستخدم */}
              <div className="scan-login-field-group">
                <label className="scan-login-label" htmlFor="scanner-username">
                  اسم المستخدم الميداني
                </label>
                <div className={`scan-login-input-wrapper ${errors.username ? 'error' : ''}`}>
                  <input
                    id="scanner-username"
                    name="username"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    dir="ltr"
                    className="scan-login-input"
                    placeholder="scanner.gate1"
                    value={formData.username}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.username}
                  />
                  <div className="scan-login-input-icon">
                    <span className="scan-login-symbol">person</span>
                  </div>
                </div>
                <FieldError message={errors.username} />
                <p className="scan-login-hint">أدخل رمز البوابة المعتمد في الجدول اليومي</p>
              </div>

              {/* حقل كلمة السر */}
              <div className="scan-login-field-group">
                <label className="scan-login-label" htmlFor="scanner-password">
                  كلمة السر
                </label>
                <div className={`scan-login-input-wrapper ${errors.password ? 'error' : ''}`}>
                  <input
                    id="scanner-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    dir="ltr"
                    className="scan-login-input has-left-icon"
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.password}
                  />
                  <div className="scan-login-input-icon">
                    <span className="scan-login-symbol">lock</span>
                  </div>
                  {/* العين بتظهر على اليسار أول ما تكتب */}
                  {formData.password && (
                    <button
                      type="button"
                      className="scan-login-toggle-btn"
                      aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      <span className="scan-login-symbol">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  )}
                </div>
                <FieldError message={errors.password} />
              </div>

              {/* زر الدخول */}
              <button type="submit" className="scan-login-submit-btn" disabled={loading}>
                <span>{loading ? 'جاري الدخول...' : 'تسجيل الدخول وبدء المسح'}</span>
                <span className="scan-login-symbol">arrow_back</span>
              </button>
            </form>
          </section>

          {/* تذييل الدعم الميداني */}
          <footer className="scan-login-footer">
            <div className="scan-login-footer-box">
              <span className="scan-login-symbol" style={{ color: '#ca4b00', flexShrink: 0 }}>
                support_agent
              </span>
              <p>في حال واجهت مشكلة، تواصل فوراً مع مشرف الاتحاد في الميدان</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
