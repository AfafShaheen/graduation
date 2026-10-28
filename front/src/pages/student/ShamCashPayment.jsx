import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../style/ShamCashPayment.css';
import unionLogo from '../../assets/only-logo.png';
import { getPaymentInfo, submitPayment, getShamcashQr } from '../../api/graduate';
import { getGraduateToken } from '../../api/session';
import { parseAmount, formatAmount } from '../../utils/amount.js';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';

const LETTERS = /^[\p{L}\s]+$/u; // حروف (عربية أو لاتينية) ومسافات فقط
const TX_ID = /^[A-Za-z0-9-]+$/; // أرقام وحروف وشرطة، بدون مسافات

const formatMoney = (value) => Number(value).toLocaleString('en-US');

/* تحويل الأرقام العربية لإنجليزية وإزالة أي رمز غير رقمي */
const toDigits = (value) =>
  value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const makeValidators = () => ({
  transactionId: (v) => {
    const t = v.trim();
    if (!t) return 'يرجى إدخال رقم العملية';
    if (!TX_ID.test(t)) return 'رقم العملية يجب ألا يحتوي على مسافات أو رموز';
    return '';
  },
  transferAmount: (v) => {
    const t = toDigits(v);
    if (!t) return 'يرجى إدخال المبلغ المحوّل';
    if (Number(t) <= 0) return 'يرجى إدخال مبلغ صحيح';
    return '';
  },
  senderName: (v) => {
    const t = v.trim().replace(/\s+/g, ' ');
    if (!t) return 'يرجى إدخال اسم المرسل';
    if (!/^[\p{L}\s]+$/u.test(t)) return 'يجب أن يتكون الاسم من حروف فقط';
    if (t.split(' ').length < 2) return 'يرجى كتابة الاسم والكنية (كلمتان على الأقل)';
    return '';
  },
});

const fieldIds = {
  transactionId: 'transactionId',
  transferAmount: 'transferAmount',
  senderName: 'senderName',
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="sc-error-text" role="alert">
      {message}
    </p>
  );
}

export default function ShamCashPayment({ onBack }) {
  const navigate = useNavigate();

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [qrSrc, setQrSrc] = useState(null);
  const [objectUrl, setObjectUrl] = useState(null);

  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({ transactionId: '', transferAmount: '', senderName: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const amountValue = info ? parseAmount(info.amount) : 0;
  const validators = makeValidators(amountValue);
  const apiBase = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    let revoked = null;
    const load = async () => {
      const accessValue = getGraduateToken();
      if (!accessValue) {
        navigate('/login', { replace: true });
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const result = await getPaymentInfo(accessValue);
        if (!mounted.current) return;
        setInfo(result);
        setFormData((prev) => ({
          ...prev,
          transferAmount: prev.transferAmount || formatAmount(result.amount),
        }));
        if (result.qr_image_url) {
          const url = String(result.qr_image_url);
          setQrSrc(url.startsWith('http') ? url : `${apiBase}${url}`);
        } else {
          const objUrl = await getShamcashQr();
          if (!mounted.current) {
            if (objUrl) URL.revokeObjectURL(objUrl);
            return;
          }
          if (objUrl) {
            setQrSrc(objUrl);
            setObjectUrl(objUrl);
            revoked = objUrl;
          }
        }
      } catch (err) {
        if (mounted.current) setLoadError(err?.message || 'تعذّر تحميل معلومات الدفع، حاول لاحقاً.');
      } finally {
        if (mounted.current) setLoading(false);
      }
    };
    load();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    const digitsOnly = info?.account_number ? String(info.account_number) : '';
    if (!digitsOnly) return;
    try {
      await navigator.clipboard.writeText(digitsOnly);
    } catch {
      const el = document.createElement('textarea');
      el.value = digitsOnly;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } catch {
        /* لا شيء */
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => mounted.current && setCopied(false), 2000);
  };

  const handleInputChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;
    if (name === 'transferAmount') value = toDigits(value);

    setFormData((prev) => ({ ...prev, [name]: value }));
    if (submitted) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const amountMismatch =
    submitted && !errors.transferAmount && parseAmount(formData.transferAmount) !== amountValue;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const newErrors = {};
    Object.keys(validators).forEach((name) => {
      newErrors[name] = validators[name](formData[name]);
    });
    setErrors(newErrors);
    setSubmitted(true);
    setSubmitError('');

    const firstInvalid = Object.keys(newErrors).find((k) => newErrors[k]);
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    const accessValue = getGraduateToken();
    if (!accessValue) {
      navigate('/login');
      return;
    }

    setSubmitting(true);
    try {
      await submitPayment(
        {
          transaction_number: formData.transactionId.trim(),
          amount: parseAmount(formData.transferAmount),
          sender_name: formData.senderName.trim().replace(/\s+/g, ' '),
        },
        accessValue,
      );
      navigate('/payment-submitted', { replace: true });
    } catch (err) {
      if (err?.status === 409) {
        setErrors((prev) => ({
          ...prev,
          transactionId: err?.message || 'رقم العملية مستخدم مسبقاً.',
        }));
      } else if (err?.status === 422 && err?.fieldErrors) {
        setErrors((prev) => ({ ...prev, ...err.fieldErrors }));
      } else if (err?.status === 403) {
        setSubmitError(err?.message || 'التسجيل مغلق حالياً.');
      } else {
        setSubmitError(err?.message || 'تعذّر إرسال بيانات الدفع، حاول لاحقاً.');
      }
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  return (
    <div className="sc-app-container">
      <main className="sc-mobile-shell">
        <header className="sc-header-main">
          <div className="sc-header-top">
            <button
              aria-label="الرجوع للخلف"
              className="sc-icon-btn"
              type="button"
              onClick={() => (onBack ? onBack() : window.history.back())}
            >
              <span className="sc-symbol" style={{ fontSize: '22px' }}>
                arrow_forward
              </span>
            </button>

            <h1 className="sc-header-title">{CEREMONY_TITLE}</h1>

            <div className="sc-icon-btn static">
              <img className="sc-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="sc-header-subband">
            <span className="sc-subband-title">الدفع عبر شام كاش</span>
            <span className="sc-badge-batch">{BATCH_BADGE}</span>
          </div>
        </header>

        <div className="sc-main-stage">
          <div className="sc-status-row">
            <span className="sc-status-badge">
              <span className="sc-status-dot"></span>
              بوابة السداد الإلكتروني المعتمدة
            </span>
          </div>

          {loading && <p className="sc-qr-caption">جارٍ تحميل معلومات الدفع...</p>}

          {loadError && !loading && (
            <section className="sc-card-box" role="alert">
              <p className="sc-error-text">{loadError}</p>
            </section>
          )}

          {!loading && !loadError && info && (
            <section className="sc-card-box">
              <div className="sc-recipient-header">
                <span className="sc-recipient-subtitle">الحساب المعتمد للاستلام</span>
                <h2 className="sc-recipient-title">{info.receiver_name}</h2>
              </div>

              <div className="sc-qr-section">
                <div className="sc-qr-box">
                  {qrSrc ? (
                    <img className="sc-qr-svg" src={qrSrc} alt="رمز QR للتحويل عبر شام كاش" />
                  ) : (
                    <span className="sc-qr-caption" style={{ textAlign: 'center' }}>
                      رمز الاستجابة السريعة غير متوفر حالياً، يمكنك التحويل يدوياً إلى رقم الحساب الظاهر أدناه.
                    </span>
                  )}
                </div>
                <span className="sc-qr-caption">
                  <span className="sc-symbol" style={{ fontSize: '14px' }}>
                    qr_code_scanner
                  </span>
                  امسح الكود مباشرة عبر تطبيق شام كاش
                </span>
              </div>

              <div className="sc-account-strip">
                <div className="sc-account-details">
                  <span className="sc-account-label">رقم الحساب المستلم</span>
                  <span className="sc-account-number">{info.account_number}</span>
                </div>
                <button
                  className={`sc-copy-btn ${copied ? 'copied' : ''}`}
                  type="button"
                  onClick={handleCopy}
                >
                  <span className="sc-symbol" style={{ fontSize: '18px', color: copied ? '#124d44' : '#ca4b00' }}>
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  <span>{copied ? 'تم النسخ' : 'نسخ الرقم'}</span>
                </button>
              </div>

              <div className="sc-amount-banner">
                <span className="sc-amount-label">المبلغ المطلوب:</span>
                <span className="sc-amount-value">{Number(amountValue).toLocaleString('en-US')} ل.س</span>
              </div>

              {info.note_instruction && (
                <div className="sc-notice-box">
                  <span className="sc-symbol sc-notice-icon">info</span>
                  <p className="sc-notice-text">{info.note_instruction}</p>
                </div>
              )}

              <div className="sc-form-section">
                <div className="sc-form-header">
                  <span className="sc-symbol" style={{ color: '#ca4b00' }}>edit_note</span>
                  <h3 className="sc-form-title">بيانات التحويل للتأكيد</h3>
                </div>
                <form className="sc-form-body" onSubmit={handleSubmit} noValidate autoComplete="off">
                  <div className="sc-field-group">
                    <label className="sc-label" htmlFor="transactionId">
                      <span>رقم العملية (رقم الإشعار من تطبيق شام كاش)</span>
                      <span className="sc-star">*</span>
                    </label>
                    <div className="sc-input-wrapper">
                      <input
                        id="transactionId"
                        name="transactionId"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        className={`sc-input ${errors.transactionId ? 'error' : ''}`}
                        placeholder="مثال: 948271503"
                        value={formData.transactionId}
                        onChange={handleInputChange}
                        aria-invalid={!!errors.transactionId}
                      />
                      <span className="sc-symbol sc-input-icon-left">pin</span>
                    </div>
                    <FieldError message={errors.transactionId} />
                  </div>

                  <div className="sc-field-group">
                    <label className="sc-label" htmlFor="transferAmount">
                      <span>المبلغ المحوّل (ل.س)</span>
                      <span className="sc-star">*</span>
                    </label>
                    <div className="sc-input-wrapper">
                      <input
                        id="transferAmount"
                        name="transferAmount"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        className={`sc-input ${errors.transferAmount ? 'error' : ''}`}
                        style={{ fontWeight: 'bold' }}
                        value={formData.transferAmount}
                        onChange={handleInputChange}
                        aria-invalid={!!errors.transferAmount}
                      />
                      <span className="sc-symbol sc-input-icon-left">payments</span>
                    </div>
                    <FieldError message={errors.transferAmount} />
                    {amountMismatch && (
                      <p className="sc-error-text" role="alert">
                        تنبيه: المبلغ المُدخل لا يطابق المبلغ المطلوب ({Number(amountValue).toLocaleString('en-US')} ل.س).
                        يمكنك المتابعة، وسيُراجع الفريق الفرق يدوياً.
                      </p>
                    )}
                  </div>

                  <div className="sc-field-group">
                    <label className="sc-label" htmlFor="senderName">
                      <span>اسم المرسل (الاسم والكنية)</span>
                      <span className="sc-star">*</span>
                    </label>
                    <div className="sc-input-wrapper">
                      <input
                        id="senderName"
                        name="senderName"
                        type="text"
                        autoComplete="off"
                        className={`sc-input ${errors.senderName ? 'error' : ''}`}
                        placeholder="الاسم والكنية المسجل بهما الحساب"
                        value={formData.senderName}
                        onChange={handleInputChange}
                        aria-invalid={!!errors.senderName}
                      />
                      <span className="sc-symbol sc-input-icon-left">person</span>
                    </div>
                    <FieldError message={errors.senderName} />
                  </div>

                  {submitError && (
                    <p className="sc-error-text" role="alert">
                      {submitError}
                    </p>
                  )}

                  <button
                    className={`sc-submit-btn ${submitting ? 'disabled' : ''}`}
                    type="submit"
                    disabled={submitting}
                  >
                    <span>{submitting ? 'جارٍ الإرسال...' : 'إرسال بيانات الدفع'}</span>
                    <span className="sc-symbol">send</span>
                  </button>
                </form>
              </div>
            </section>
          )}

          <footer className="sc-footer">
            <p className="sc-footer-main">{CEREMONY_TITLE}</p>
            <p className="sc-footer-sub">إصدار البطاقة الإلكترونية مؤمَّن ومعتمد رسمياً</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
