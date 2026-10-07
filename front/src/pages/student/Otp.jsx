import React, { useState, useRef, useEffect } from 'react';
import '../../style/Otp.css';
import unionLogo from '../../assets/only-logo.png';

const CODE_LENGTH = 6;
const CODE_LIFETIME = 600; // صلاحية الرمز بالثواني (10 دقائق)
const RESEND_COOLDOWN = 60; // الانتظار قبل إعادة الإرسال بالثواني

/*
  تحقق تجريبي إلى أن يجهز الباك إند.
  بدّله بطلب حقيقي مثل: fetch('/api/verify-otp', ...) يرجع true أو false،
  أو مرّره من الخارج عبر الخاصية verifyCode.
*/
const DEMO_CODE = '123456';
async function mockVerify(code) {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return code === DEMO_CODE;
}

const ERROR_MESSAGES = {
  wrong: 'رمز التحقق غير صحيح، يرجى المحاولة مرة أخرى',
  incomplete: `يرجى إدخال رمز التحقق كاملاً المكوّن من ${CODE_LENGTH} أرقام`,
  expired: 'انتهت صلاحية الرمز، يرجى طلب رمز جديد',
  failed: 'تعذّر التحقق حالياً، يرجى المحاولة لاحقاً',
};

const emptyOtp = () => Array(CODE_LENGTH).fill('');

export default function Otp({
  email = 'student@gmail.com',
  onBack,
  onVerified,
  onResend,
  verifyCode = mockVerify,
}) {
  const [otp, setOtp] = useState(emptyOtp());
  const [timer, setTimer] = useState(CODE_LIFETIME);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [status, setStatus] = useState('idle'); // idle | verifying | success | error
  const [errorKind, setErrorKind] = useState('');
  const [notice, setNotice] = useState('');

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
    try {
      const ok = await verifyCode(code);
      if (!mounted.current) return;

      if (ok) {
        setStatus('success');
        // نترك المربعات خضراء لحظة قبل الانتقال للواجهة التالية
        setTimeout(() => {
          if (!mounted.current) return;
          if (onVerified) onVerified(code);
          else alert('تم تأكيد الحساب بنجاح');
        }, 900);
      } else {
        setStatus('error');
        setErrorKind('wrong');
        // نفرّغ الخانات بعد لحظة ليعيد المستخدم الإدخال
        clearTimeoutRef.current = setTimeout(() => {
          if (!mounted.current) return;
          setOtp(emptyOtp());
          inputRefs.current[0]?.focus();
        }, 700);
      }
    } catch (err) {
      if (!mounted.current) return;
      setStatus('error');
      setErrorKind('failed');
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

  const handleResend = () => {
    if (resendCooldown > 0 || status === 'success' || status === 'verifying') return;
    if (onResend) onResend();
    clearTimeout(clearTimeoutRef.current);
    setOtp(emptyOtp());
    setStatus('idle');
    setErrorKind('');
    setTimer(CODE_LIFETIME);
    setResendCooldown(RESEND_COOLDOWN);
    setNotice('تم إرسال رمز جديد إلى بريدك الإلكتروني');
    inputRefs.current[0]?.focus();
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

            <h1 className="ev-header-title">حفل تخرج جامعة حمص</h1>

            <div className="ev-icon-btn static">
              <img className="ev-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="ev-header-subband">
            <span className="ev-subband-title">إنشاء حساب</span>
            <span className="ev-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* شريط التقدم 100% */}
        <section className="ev-progress-section">
          <div className="ev-progress-labels">
            <span className="ev-progress-title">خطوة 3 من 3: تأكيد البريد الإلكتروني</span>
            <span className="ev-progress-percent">100%</span>
          </div>
          <div className="ev-progress-bar">
            <div className="ev-progress-fill"></div>
            <div className="ev-progress-fill"></div>
            <div className="ev-progress-fill"></div>
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
              <button className="ev-edit-btn" type="button" onClick={onBack}>
                <span>تعديل البريد</span>
                <span className="ev-symbol" style={{ fontSize: '13px' }}>edit</span>
              </button>
            </div>

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
                  {status === 'error' && errorKind && (
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

          <div className="ev-support-link-wrapper">
            <a href="#support" className="ev-support-link">
              هل تواجه مشكلة؟ تواصل مع الدعم الفني
            </a>
          </div>
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
          <p className="ev-institutional-label">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
        </div>
      </main>
    </div>
  );
}