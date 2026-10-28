import React, { useState, useRef, useEffect } from 'react';
import '../../style/Otp.css';
import '../../style/BrandHeader.css';
import unionLogo from '../../assets/only-logo.png';
import { verifyOtp, resendOtp, changeEmail, forgotPassword } from '../../api/graduate';
import { setGraduateSession, clearVerificationToken, setVerificationToken, setGraduateEmail, getVerificationToken, getGraduateEmail, setResetCode, clearResetFlow } from '../../api/session';
import HelpFooter from '../../components/HelpFooter';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';

const CODE_LENGTH = 6;
const CODE_LIFETIME = 600;
const RESEND_COOLDOWN = 60;

const ERROR_MESSAGES = {
  wrong: 'رمز التحقق غير صحيح، يرجى المحاولة مرة أخرى',
  incomplete: `يرجى إدخال رمز التحقق كاملاً المكوّن من ${CODE_LENGTH} أرقام`,
  expired: 'انتهت صلاحية الرمز، يرجى طلب رمز جديد',
  failed: 'تعذّر التحقق حالياً، يرجى المحاولة لاحقاً',
};

/* أول خطأ حقلي من رسالة 422، لعرض السبب الفعلي بدل الرسالة العامة */
const firstFieldError = (err) => {
  const fieldErrors = err?.fieldErrors;
  if (!fieldErrors) return '';
  const keys = Object.keys(fieldErrors);
  return keys.length ? fieldErrors[keys[0]] : '';
};

const emptyOtp = () => Array(CODE_LENGTH).fill('');

/* نصوص الهيدر وشريط التقدم حسب نوع المسار */
const FLOWS = {
  register: {
    subtitle: 'إنشاء حساب',
    progressTitle: 'خطوة 3 من 4: تأكيد البريد الإلكتروني',
    percent: '75%',
    total: 4,
    done: 3,
  },
  reset: {
    subtitle: 'استعادة كلمة السر',
    progressTitle: 'خطوة 1 من 2: تأكيد البريد الإلكتروني',
    percent: '50%',
    total: 2,
    done: 1,
  },
};

export default function Otp({
  mode = 'register',
  email: emailProp,
  onBack,
  onVerified,
}) {
  const flow = FLOWS[mode] || FLOWS.register;
  const [otp, setOtp] = useState(emptyOtp());
  const [timer, setTimer] = useState(CODE_LIFETIME);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [status, setStatus] = useState('idle');
  const [errorKind, setErrorKind] = useState('');
  const [notice, setNotice] = useState('');
  const [serverError, setServerError] = useState('');
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [changeEmailError, setChangeEmailError] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [email, setEmail] = useState(emailProp || getGraduateEmail() || '');

  const verificationToken = getVerificationToken();
  const isResetMode = mode === 'reset';

  const inputRefs = useRef([]);
  const mounted = useRef(true);
  const clearTimeoutRef = useRef(null);

  const expired = timer === 0;
  const locked = status === 'verifying' || status === 'success' || expired;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(clearTimeoutRef.current);
    };
  }, []);

  // المؤقتات: بتتوقف عند نجاح التحقق
  useEffect(() => {
    if (status === 'success') return undefined;
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // التحقق التلقائي عند اكتمال الخانات
  useEffect(() => {
    if (otp.every(Boolean) && (status === 'idle' || status === 'error') && !expired) {
      runVerify(otp.join(''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // تحويل الثواني لتنسيق MM:SS
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const runVerify = async (code) => {
    setStatus('verifying');
    setErrorKind('');
    setNotice('');
    setServerError('');

    if (isResetMode) {
      setResetCode(code);
      setStatus('success');
      setTimeout(() => {
        if (!mounted.current) return;
        if (onVerified) onVerified(code);
      }, 500);
      return;
    }

    if (!verificationToken) {
      setStatus('error');
      setErrorKind('failed');
      setServerError('انتهت الجلسة، يرجى تسجيل الدخول لإكمال تأكيد البريد');
      return;
    }

    try {
      const result = await verifyOtp(code, verificationToken);
      if (!mounted.current) return;

      setGraduateSession({ accessToken: result.access_token, expiresIn: result.expires_in });
      clearVerificationToken();

      setStatus('success');
      setTimeout(() => {
        if (!mounted.current) return;
        if (onVerified) onVerified(code);
      }, 900);
    } catch (err) {
      if (!mounted.current) return;

      if (err.status === 401) {
        clearVerificationToken();
        setStatus('error');
        setErrorKind('failed');
        setServerError(err.message || 'انتهت الجلسة، يرجى تسجيل الدخول لإكمال تأكيد البريد');
        return;
      }

      setStatus('error');
      setErrorKind('wrong');
      setServerError(firstFieldError(err) || err.message || 'رمز التحقق غير صحيح');

      if (err.status === 429) {
        setErrorKind('failed');
        setServerError(err.message);
      }

      clearTimeoutRef.current = setTimeout(() => {
        if (!mounted.current) return;
        setOtp(emptyOtp());
        inputRefs.current[0]?.focus();
      }, 700);
    }
  };

  const resetFeedback = () => {
    clearTimeout(clearTimeoutRef.current);
    if (status === 'error') {
      setStatus('idle');
      setErrorKind('');
    }
    if (notice) setNotice('');
  };

  // تعبئة الخانات بدءاً من خانة معيّنة (للصق أو التعبئة التلقائية للرمز)
  const fillFrom = (startIndex, digits) => {
    const next = [...otp];
    digits.split('').forEach((d, i) => {
      if (startIndex + i < CODE_LENGTH) next[startIndex + i] = d;
    });
    setOtp(next);
    inputRefs.current[Math.min(startIndex + digits.length, CODE_LENGTH - 1)]?.focus();
  };

  // التنقل الآلي بين حقول الـ OTP
  const handleInputChange = (index, value) => {
    if (locked) return;
    const digits = value.replace(/\D/g, '');
    resetFeedback();

    if (digits.length > 2) {
      fillFrom(index, digits);
      return;
    }

    const next = [...otp];
    next[index] = digits.slice(-1);
    setOtp(next);

    if (digits && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      e.preventDefault();
      resetFeedback();
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (locked) return;
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!digits) return;
    resetFeedback();
    fillFrom(0, digits);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || status === 'success' || status === 'verifying') return;

    if (isResetMode) {
      try {
        await forgotPassword(email);
        resetOtpState();
        setNotice('تم إرسال رمز جديد إلى بريدك الإلكتروني');
        inputRefs.current[0]?.focus();
      } catch (err) {
        setServerError(firstFieldError(err) || err.message || 'تعذّر إعادة إرسال الرمز، حاول لاحقاً');
      }
      return;
    }

    try {
      await resendOtp(verificationToken);
      resetOtpState();
      setNotice('تم إرسال رمز جديد إلى بريدك الإلكتروني');
      inputRefs.current[0]?.focus();
    } catch (err) {
      setServerError(firstFieldError(err) || err.message || 'تعذّر إعادة إرسال الرمز، حاول لاحقاً');
    }
  };

  const resetOtpState = () => {
    clearTimeout(clearTimeoutRef.current);
    setOtp(emptyOtp());
    setStatus('idle');
    setErrorKind('');
    setTimer(CODE_LIFETIME);
    setResendCooldown(RESEND_COOLDOWN);
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    if (changingEmail) return;
    const trimmed = newEmail.trim();
    setChangeEmailError('');
    if (!trimmed) {
      setChangeEmailError('يرجى إدخال البريد الإلكتروني الجديد');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setChangeEmailError('صيغة البريد الإلكتروني غير صحيحة');
      return;
    }
    if (trimmed.toLowerCase() === (email || '').toLowerCase()) {
      setChangeEmailError('هذا هو البريد الحالي نفسه');
      return;
    }
    if (!verificationToken) {
      setChangeEmailError('انتهت جلسة التحقق، سجّل الدخول من جديد');
      return;
    }

    setChangingEmail(true);
    try {
      await changeEmail(trimmed, verificationToken);
      setEmail(trimmed);
      setGraduateEmail(trimmed);
      setShowChangeEmail(false);
      setNewEmail('');
      setNotice('تم إرسال رمز جديد');
      resetOtpState();
      inputRefs.current[0]?.focus();
    } catch (err) {
      setChangeEmailError(firstFieldError(err) || err.message || 'تعذّر تغيير البريد');
    } finally {
      setChangingEmail(false);
    }
  };

  const closeChangeEmail = () => {
    setShowChangeEmail(false);
    setNewEmail('');
    setChangeEmailError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (status === 'verifying' || status === 'success') return;

    if (expired) {
      setStatus('error');
      setErrorKind('expired');
      return;
    }
    if (!otp.every(Boolean)) {
      setStatus('error');
      setErrorKind('incomplete');
      inputRefs.current[otp.findIndex((d) => !d)]?.focus();
      return;
    }
    runVerify(otp.join(''));
  };

  const fieldClass = (digit) => {
    if (status === 'success') return 'success';
    if (status === 'error' && (errorKind === 'wrong' || (errorKind === 'incomplete' && !digit))) {
      return 'error';
    }
    return '';
  };

  const buttonLabel = () => {
    if (status === 'verifying') return 'جارٍ التحقق...';
    if (status === 'success') return 'تم التأكيد';
    return 'تأكيد ومتابعة';
  };

  return (
    <div className="ev-app-container">
      <main className="ev-mobile-shell">
        {/* الهيدر العلوي (نفس صفحات التسجيل) */}
        <header className="ev-header-main">
          <div className="ev-header-top">
            <button
              className="ev-icon-btn"
              aria-label="الرجوع للخطوة السابقة"
              type="button"
              onClick={onBack}
            >
              <span className="ev-symbol" style={{ fontSize: '22px' }}>arrow_forward</span>
            </button>

            <h1 className="ev-header-title">{CEREMONY_TITLE}</h1>

            <div className="ev-icon-btn static">
              <img className="ev-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="ev-header-subband">
            <span className="ev-subband-title">{flow.subtitle}</span>
            <span className="ev-badge-batch">{BATCH_BADGE}</span>
          </div>
        </header>

        {/* شريط التقدم */}
        <section className="ev-progress-section">
          <div className="ev-progress-labels">
            <span className="ev-progress-title">{flow.progressTitle}</span>
            <span className="ev-progress-percent">{flow.percent}</span>
          </div>
          <div
            className="ev-progress-bar"
            style={{ gridTemplateColumns: `repeat(${flow.total}, 1fr)` }}
          >
            {Array.from({ length: flow.total }).map((_, i) => (
              <div
                key={i}
                className={i < flow.done ? 'ev-progress-fill' : 'ev-progress-empty'}
              ></div>
            ))}
          </div>
        </section>

        {/* محتوى الصفحة الرئيسي */}
        <div className="ev-main-stage">
          <div className="ev-ticket-card">
            {/* الأيقونة العلوية */}
            <div className="ev-emblem-circle">
              <span className="ev-symbol" style={{ fontSize: '32px' }}>mark_email_unread</span>
            </div>

            {/* النصوص الرئيسية */}
            <h2 className="ev-card-headline">رمز التأكيد في طريقه إليك</h2>
            <p className="ev-card-subtext">
              أرسلنا رمزاً سرّياً مكوّناً من {CODE_LENGTH} أرقام إلى بريدك الإلكتروني:
            </p>

            {/* البريد الإلكتروني مع زر التعديل */}
            <div className="ev-email-pill">
              <span className="ev-email-address" dir="ltr">{email}</span>
              <span className="ev-pill-dot">•</span>
              {!isResetMode && (
                <button className="ev-edit-btn" type="button" onClick={() => (showChangeEmail ? closeChangeEmail() : setShowChangeEmail(true))}>
                  <span>تعديل البريد</span>
                  <span className="ev-symbol" style={{ fontSize: '13px' }}>edit</span>
                </button>
              )}
              {isResetMode && (
                <button className="ev-edit-btn" type="button" onClick={onBack}>
                  <span>تعديل البريد</span>
                  <span className="ev-symbol" style={{ fontSize: '13px' }}>edit</span>
                </button>
              )}
            </div>

            {showChangeEmail && !isResetMode && (
              <form className="ev-change-email" onSubmit={handleChangeEmail} noValidate>
                <label className="ev-change-email-label" htmlFor="ev-new-email">
                  البريد الإلكتروني الجديد
                </label>
                <input
                  id="ev-new-email"
                  type="email"
                  className={`ev-change-email-input ${changeEmailError ? 'has-error' : ''}`}
                  placeholder="name@example.com"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (changeEmailError) setChangeEmailError('');
                  }}
                  dir="ltr"
                  autoComplete="email"
                  autoFocus
                  disabled={changingEmail}
                  aria-invalid={!!changeEmailError}
                  aria-describedby={changeEmailError ? 'ev-new-email-error' : undefined}
                />
                {changeEmailError && (
                  <p id="ev-new-email-error" className="ev-change-email-error" role="alert">
                    {changeEmailError}
                  </p>
                )}
                <div className="ev-change-email-actions">
                  <button type="submit" className="ev-change-email-save" disabled={changingEmail}>
                    {changingEmail ? 'جارٍ الإرسال...' : 'حفظ وإرسال الرمز'}
                  </button>
                  <button
                    type="button"
                    className="ev-change-email-cancel"
                    onClick={closeChangeEmail}
                    disabled={changingEmail}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}

            <form className="ev-otp-form" onSubmit={handleSubmit} noValidate>
              {/* حقول إدخال الـ OTP */}
              <div className="ev-otp-wrapper">
                <label className="ev-otp-label">أدخل رمز التحقق (OTP)</label>
                <div
                  className={`ev-otp-inputs-grid ${status === 'error' && errorKind === 'wrong' ? 'shake' : ''}`}
                  dir="ltr"
                  onPaste={handlePaste}
                >
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      inputMode="numeric"
                      autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                      aria-label={`الخانة ${idx + 1} من ${CODE_LENGTH}`}
                      aria-invalid={status === 'error'}
                      className={`ev-otp-field ${fieldClass(digit)}`}
                      value={digit}
                      disabled={locked}
                      onChange={(e) => handleInputChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                <div className="ev-otp-message" aria-live="polite">
                  {serverError && (
                    <p className="ev-error-text" role="alert">{serverError}</p>
                  )}
                  {status === 'error' && errorKind && !serverError && (
                    <p className="ev-error-text" role="alert">{ERROR_MESSAGES[errorKind]}</p>
                  )}
                  {status === 'success' && (
                    <p className="ev-success-text">تم التحقق بنجاح، جارٍ تحويلك إلى الخطوة التالية...</p>
                  )}
                  {notice && status !== 'error' && status !== 'success' && (
                    <p className="ev-success-text">{notice}</p>
                  )}
                </div>
              </div>

              {/* العدّاد وإعادة الإرسال */}
              <div className="ev-meta-row">
                <div className={`ev-timer-badge ${expired ? 'expired' : ''}`}>
                  <span
                    className="ev-symbol"
                    style={{ fontSize: '17px', color: expired ? '#ba1a1a' : '#ca4b00' }}
                  >
                    schedule
                  </span>
                  {expired ? (
                    <span>انتهت صلاحية الرمز</span>
                  ) : (
                    <span>
                      صلاحية الرمز: <strong className="ev-timer-text">{formatTimer(timer)}</strong>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={`ev-resend-btn ${resendCooldown > 0 ? 'disabled' : 'active'}`}
                  disabled={resendCooldown > 0 || status === 'success' || status === 'verifying'}
                  onClick={handleResend}
                >
                  <span className="ev-symbol" style={{ fontSize: '14px' }}>sync</span>
                  <span>
                    {resendCooldown > 0 ? `إعادة الإرسال بعد (${resendCooldown}ث)` : 'إعادة إرسال الرمز'}
                  </span>
                </button>
              </div>

              {/* صندوق الملاحظة */}
              <div className="ev-info-box">
                <span className="ev-symbol" style={{ fontSize: '18px', color: '#ca4b00', flexShrink: 0 }}>info</span>
                <p className="ev-info-text">
                  <strong>لم يصلك شيء؟</strong> تحقّق من مجلد الرسائل غير المرغوب فيها (Spam)، أو من صحة عنوان بريدك الإلكتروني.
                </p>
              </div>
            </form>
          </div>

          <HelpFooter />
        </div>

        {/* الشريط السفلي والزر */}
        <div className="ev-footer-section">
          <button
            className="ev-submit-btn"
            type="button"
            onClick={handleSubmit}
            disabled={status === 'verifying' || status === 'success'}
          >
            <span>{buttonLabel()}</span>
            <span className="ev-symbol" style={{ fontSize: '20px' }}>
              {status === 'success' ? 'check_circle' : 'arrow_back'}
            </span>
          </button>
          <p className="ev-institutional-label">{CEREMONY_TITLE}</p>
        </div>
      </main>
    </div>
  );
}