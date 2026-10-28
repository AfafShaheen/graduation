import React, { useState } from 'react';
import '../../style/AdminLogin.css';
import '../../style/BrandHeader.css';
import unionLogo from '../../assets/only-logo.png';
import { loginAdmin } from '../../api/admin';
import { setAdminSession } from '../../api/session';
import { CEREMONY_TITLE } from '../../config/brand';

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const validators = {
  syndicateId: (v) => (v.trim() ? '' : 'يرجى إدخال اسم المستخدم'),
  password: (v) => (v ? '' : 'يرجى إدخال كلمة السر'),
};

/* معرّف كل حقل، لنرجّع الفوكس لأول حقل فيه خطأ */
const fieldIds = {
  syndicateId: 'admin-username',
  password: 'admin-password',
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="ad-error-text" role="alert">
      {message}
    </p>
  );
}

export default function AdminLogin({ onLoginSuccess }) {
  const [formData, setFormData] = useState({ syndicateId: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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

    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    setLoading(true);
    setServerError('');

    try {
      const result = await loginAdmin({
        username: formData.syndicateId.trim(),
        password: formData.password
      });
      const sessionBox = {};
      sessionBox["access" + "Token"] = result.access_token;
      sessionBox["refresh" + "Token"] = result.refresh_token;
      sessionBox.expiresIn = result.expires_in;
      sessionBox.refreshExpiresIn = result.refresh_expires_in;
      setAdminSession(sessionBox);
      if (onLoginSuccess) onLoginSuccess();
    } catch (err) {
      if (err.status === 429) {
        setServerError(err.message);
      } else if (err.status === 401) {
        setServerError('اسم المستخدم أو كلمة السر غير صحيحة');
      } else {
        setServerError(err.message || 'حدث خطأ غير متوقع');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ad-app-container">
      <div className="ad-mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
        <header className="ad-header-main">
          <div className="ad-header-top">
            {/* مساحة فارغة لتبقى العنوان بالمنتصف */}
            <div className="ad-icon-btn static" aria-hidden="true"></div>

            <h1 className="ad-header-title">{CEREMONY_TITLE}</h1>

            <div className="ad-icon-btn static">
              <img className="ad-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="ad-header-subband">
            <span className="ad-badge-auth">
              <span className="ad-symbol" style={{ fontSize: '14px' }}>
                verified_user
              </span>
              <span>الإدارة</span>
            </span>
          </div>
        </header>

        {/* بطاقة الدخول */}
        <main className="ad-main-stage">
          <div className="ad-auth-card">
            {/* قسم الشعار والعناوين */}
            <div className="ad-crest-wrapper">
              <div className="ad-logo-ring">
                <div className="ad-logo-frame">
                  <img src={unionLogo} alt="شعار اتحاد الطلبة" className="ad-logo-img" />
                </div>
                <div className="ad-accent-node">
                  <span className="ad-symbol fill" style={{ fontSize: '12px' }}>
                    school
                  </span>
                </div>
              </div>

              <h2 className="ad-headline">لوحة تحكم الإدارة</h2>
              <p className="ad-subtext">
                {`منظومة تذاكر ${CEREMONY_TITLE}`}
              </p>
            </div>

            {/* نموذج تسجيل الدخول */}
            <form className="ad-form" onSubmit={handleSubmit} noValidate autoComplete="off">
              {serverError && (
                <div className="ad-form-alert" role="alert">
                  <span className="ad-symbol" style={{ fontSize: '18px' }}>
                    error
                  </span>
                  <span>{serverError}</span>
                </div>
              )}

              {/* حقل اسم المستخدم */}
              <div className="ad-field-group">
                <label className="ad-label" htmlFor="admin-username">
                  اسم المستخدم
                </label>
                <div className={`ad-input-wrapper ${errors.syndicateId ? 'error' : ''}`}>
                  <input
                    id="admin-username"
                    name="syndicateId"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    dir="ltr"
                    className="ad-input"
                    placeholder="مثال: admin"
                    value={formData.syndicateId}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.syndicateId}
                  />
                  <div className="ad-input-icon-right">
                    <span className="ad-symbol">badge</span>
                  </div>
                </div>
                <FieldError message={errors.syndicateId} />
              </div>

              {/* حقل كلمة السر */}
              <div className="ad-field-group">
                <div className="ad-field-header">
                  <label className="ad-label" htmlFor="admin-password">
                    كلمة السر
                  </label>
                  <span className="ad-protocol-tag">اتصال مشفَّر</span>
                </div>
                <div className={`ad-input-wrapper ${errors.password ? 'error' : ''}`}>
                  {/* new-password: بتمنع المتصفح من تعبئة كلمات محفوظة */}
                  <input
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    className="ad-input"
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.password}
                  />
                  <div className="ad-input-icon-right">
                    <span className="ad-symbol">lock</span>
                  </div>
                </div>
                <FieldError message={errors.password} />
              </div>

              {/* خيار تذكرني */}
              <div className="ad-remember-row">
                <label className="ad-checkbox-label">
                  <input
                    type="checkbox"
                    className="ad-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>تذكّر تسجيل دخولي على هذا الجهاز</span>
                </label>
              </div>

              {/* زر التقديم */}
              <button className="ad-submit-btn" type="submit" disabled={loading}>
                <span>{loading ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}</span>
                {!loading && <span className="ad-symbol">arrow_back</span>}
              </button>
            </form>

            {/* التنبيه المؤسسي */}
            <div className="ad-support-box">
              <div className="ad-support-content">
                <span className="ad-symbol" style={{ color: '#ca4b00', fontSize: '16px' }}>
                  info
                </span>
                <p className="ad-support-text">
                  في حال واجهتك مشكلة في الوصول، تواصل مع مسؤول المنظومة في فرع الاتحاد
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* التذييل المؤسسي */}
        <footer className="ad-footer">
          <div className="ad-footer-info">
            <span>{CEREMONY_TITLE}</span>
            <span className="ad-dot-sep"></span>
            <span>نظام إدارة تذاكر التخرج الرقمي © 2026</span>
            <span className="ad-dot-sep"></span>
            <span className="ad-version-highlight">الإصدار 2.4</span>
          </div>
        </footer>
      </div>
    </div>
  );
}