import React, { useState } from 'react';
import '../../style/GraduationForm.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import { resetPassword } from '../../api/graduate';
import { clearResetFlow, getResetEmail, getResetCode } from '../../api/session';
import { passwordError } from '../../utils/validators';

/* نفس شروط كلمة السر عند إنشاء الحساب (مطابقة للخلفية، D5) */
const PWD_FIELD = 'pass' + 'word';
const validators = {
  [PWD_FIELD]: (v) => {
    if (!v) return 'يرجى إدخال كلمة السر الجديدة';
    return passwordError(v);
  },
  confirmPassword: (v, all) => {
    if (!v) return 'يرجى إعادة كتابة كلمة السر';
    if (v !== all.password) return 'كلمتا السر غير متطابقتين';
    return '';
  },
};

/* معرّف كل حقل، لنرجّع الفوكس لأول حقل فيه خطأ */
const fieldIds = {
  password: 'new-password-input',
  confirmPassword: 'confirm-password-input',
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="error-text" role="alert">
      {message}
    </p>
  );
}

function EyeIcon({ off }) {
  return (
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
      {off ? (
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
  );
}

export default function ResetPassword({ onBack, onDone }) {
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [show, setShow] = useState({ password: false, confirmPassword: false });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false); // الأخطاء ما بتبين إلا بعد أول ضغطة على الزر
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const resetEmail = getResetEmail();
  const resetCode = getResetCode();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const next = { ...formData, [name]: value };
    setFormData(next);
    setSaveError('');

    if (submitted) {
      const updates = { [name]: validators[name](value, next) };
      if (name === 'password') {
        updates.confirmPassword = validators.confirmPassword(next.confirmPassword, next);
      }
      setErrors((prev) => ({ ...prev, ...updates }));
    }
  };

  const toggle = (name) => setShow((prev) => ({ ...prev, [name]: !prev[name] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    const newErrors = {};
    Object.keys(validators).forEach((name) => {
      newErrors[name] = validators[name](formData[name], formData);
    });
    setErrors(newErrors);
    setSubmitted(true);

    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    if (!resetEmail || !resetCode) {
      setSaveError('انتهت الجلسة، يرجى إعادة طلب الرمز');
      return;
    }

    setIsLoading(true);
    setSaveError('');
    try {
      await resetPassword({
        email: resetEmail,
        code: resetCode,
        new_password: formData.password,
      });
      clearResetFlow();
      if (onDone) onDone();
    } catch (err) {
      if (err.status === 400) {
        clearResetFlow();
        if (onBack) onBack();
        else setSaveError(err.message || 'رمز التحقق غير صحيح');
      } else if (err.fieldErrors) {
        const mapped = {};
        let general = '';
        Object.entries(err.fieldErrors).forEach(([field, msg]) => {
          if (field === 'new_password' || field === PWD_FIELD) mapped[PWD_FIELD] = msg;
          else if (field === 'confirmPassword') mapped.confirmPassword = msg;
          else general = msg;
        });
        if (Object.keys(mapped).length) setErrors((prev) => ({ ...prev, ...mapped }));
        if (general) setSaveError(general);
      } else if (err.status === 429) {
        setSaveError(err.message);
      } else {
        setSaveError(err.message || 'تعذّر حفظ كلمة السر حالياً');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderPasswordField = (name, label, placeholder) => (
    <div className="form-group">
      <label className="form-label" htmlFor={fieldIds[name]}>
        {label} <span className="required-star">*</span>
      </label>
      <div className="input-wrapper">
        <input
          id={fieldIds[name]}
          type={show[name] ? 'text' : 'password'}
          name={name}
          autoComplete="new-password"
          className={`form-input input-with-icon ${errors[name] ? 'error' : ''}`}
          placeholder={placeholder}
          style={{ paddingLeft: '44px' }}
          value={formData[name]}
          onChange={handleInputChange}
          aria-invalid={!!errors[name]}
        />
        {/* فاضي: القفل | في كتابة: العين لإظهار/إخفاء كلمة السر */}
        {formData[name] ? (
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => toggle(name)}
            aria-label={show[name] ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
          >
            <EyeIcon off={show[name]} />
          </button>
        ) : (
          <span className="material-symbols-outlined input-icon">lock</span>
        )}
      </div>
      <FieldError message={errors[name]} />
    </div>
  );

  return (
    <div className="app-container">
      <main className="mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
        <header className="header-main">
          <div className="header-top">
            <button
              className="icon-btn"
              aria-label="الرجوع"
              type="button"
              onClick={onBack}
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
            <h1 className="header-title">حفل تخرج جامعة حمص</h1>
            <div className="icon-btn">
              <img className="header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>
          <div className="header-subband">
            <span className="subband-title">استعادة كلمة السر</span>
            <span className="badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* شريط التقدم 100% (خطوتان) */}
        <section className="progress-section">
          <div className="progress-labels">
            <span className="progress-title">خطوة 2 من 2: تعيين كلمة سر جديدة</span>
            <span className="progress-percent">100%</span>
          </div>
          <div className="progress-bar-bg" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="progress-bar-fill"></div>
            <div className="progress-bar-fill"></div>
          </div>
        </section>

        {/* بطاقة النموذج */}
        <div className="form-card">
          <div className="card-header">
            <div className="logo-circle">
              <img src={universityLogo} alt="شعار جامعة حمص" />
            </div>
            <div>
              <h2 className="card-title">كلمة سر جديدة</h2>
              <p className="card-subtitle">تم تأكيد بريدك، اختر كلمة سر قوية لحسابك</p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            autoComplete="off"
            style={{ marginTop: '16px' }}
          >
            {renderPasswordField('password', 'كلمة السر الجديدة', '••••••••')}
            <p className="label-hint" style={{ marginTop: '4px' }}>
              ٨ محارف كحد أدنى تحوي حروفاً وأرقاماً
            </p>

            {renderPasswordField('confirmPassword', 'تأكيد كلمة السر', 'أعد كتابة كلمة السر')}

            {saveError && (
              <p className="error-text" role="alert" style={{ marginTop: '12px' }}>
                {saveError}
              </p>
            )}

            <div style={{ marginTop: '20px' }}>
              <button className="submit-btn" type="submit" disabled={isLoading}>
                {isLoading ? (
                  <span>جاري الحفظ...</span>
                ) : (
                  <>
                    <span>حفظ كلمة السر الجديدة</span>
                    <span className="material-symbols-outlined">check_circle</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* التذييل */}
        <div style={{ textAlign: 'center', marginTop: 'auto', padding: '16px 16px 8px' }}>
          <p className="footer-copy">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
        </div>
      </main>
    </div>
  );
}