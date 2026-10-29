import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../style/ShamCashPayment.css';
import unionLogo from '../../assets/only-logo.png';
import { getPaymentInfo, submitPayment, getShamcashQr } from '../../api/graduate';
import { getGraduateToken } from '../../api/session';
import { parseAmount, formatAmount } from '../../utils/amount.js';

/* تحويل الأرقام العربية لإنجليزية وإزالة أي رمز غير رقمي */
const toDigits = (value) =>
  value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

/* Arabic-Indic digits → Latin, then uppercase: same normalisation as the backend */
const normalizeTx = (value) =>
  value
    .trim()
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .toUpperCase();

/* backend field name → this form's field name */
const SERVER_FIELD_MAP = {
  transaction_number: 'transactionId',
  amount: 'transferAmount',
  sender_name: 'senderName',
};

/* pydantic prefixes messages with "Value error, " */
const cleanServerMessage = (msg) => String(msg || '').replace(/^Value error,\s*/i, '');

const formatMoney = (value) => Number(value).toLocaleString('en-US');

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const makeValidators = () => ({
  transactionId: (v) => {
    const t = normalizeTx(v);
    if (!t) return 'يرجى إدخال رقم العملية';
    if (/\s/.test(t)) return 'رقم العملية يجب ألا يحتوي على مسافات';
    if (!/^[A-Z0-9-]+$/.test(t)) return 'رقم العملية يقبل أحرفاً إنجليزية وأرقاماً وشرطة (-) فقط';
    if (t.length < 4) return 'رقم العملية يجب أن يكون 4 خانات على الأقل';
    if (t.length > 100) return 'رقم العملية طويل جداً (100 خانة كحد أقصى)';
    return '';
  },
  transferAmount: (v) => {
    const t = toDigits(v);
    if (!t) return 'يرجى إدخال المبلغ المحوّل';
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return 'يرجى إدخال مبلغ صحيح';
    if (n >= 100000000) return 'المبلغ كبير جداً';
    return '';
  },
  senderName: (v) => {
    const t = v.trim().replace(/\s+/g, ' ');
    if (!t) return 'يرجى إدخال اسم المرسل';
    if (!/^[؀-ۿa-zA-Z\s]+$/.test(t)) return 'يجب أن يتكون الاسم من حروف عربية أو إنجليزية فقط';
    if (t.length < 2) return 'الاسم قصير جداً';
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

  useEffect(() => {
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
        // The QR is a data URI from the JSON endpoint; never use qr_image_url as <img src>.
        try {
          const dataUri = await getShamcashQr();
          if (mounted.current) setQrSrc(dataUri);
        } catch {
          if (mounted.current) setQrSrc(null); // the account number below is still shown
        }
      } catch (err) {
        if (mounted.current) setLoadError(err?.message || 'تعذّر تحميل معلومات الدفع، حاول لاحقاً.');
      } finally {
        if (mounted.current) setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    const accountValue = info?.account_number ? String(info.account_number) : '';
    if (!accountValue) return;
    try {
      await navigator.clipboard.writeText(accountValue);
    } catch {
      const el = document.createElement('textarea');
      el.value = accountValue;
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
          transaction_number: normalizeTx(formData.transactionId),
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
        document.getElementById(fieldIds.transactionId)?.focus();
      } else if (err?.status === 422 && err?.fieldErrors) {
        const mapped = {};
        const unmapped = [];
        Object.entries(err.fieldErrors).forEach(([key, msg]) => {
          const local = SERVER_FIELD_MAP[key];
          if (local) mapped[local] = cleanServerMessage(msg);
          else unmapped.push(cleanServerMessage(msg));
        });
        setErrors((prev) => ({ ...prev, ...mapped }));
        if (unmapped.length) setSubmitError(unmapped.join(' — '));
        const first = Object.keys(mapped)[0];
        if (first) document.getElementById(fieldIds[first])?.focus();
        if (!first && !unmapped.length) setSubmitError('يرجى التحقق من البيانات المدخلة.');
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

            <h1 className="sc-header-title">حفل تخرج جامعة حمص</h1>

            <div className="sc-icon-btn static">
              <img className="sc-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="sc-header-subband">
            <span className="sc-subband-title">الدفع عبر شام كاش</span>
            <span className="sc-badge-batch">دفعة 2026</span>
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
                    <img
                      className="sc-qr-svg"
                      src={qrSrc}
                      alt="رمز QR للتحويل عبر شام كاش"
                      onError={() => setQrSrc(null)}
                    />
                  ) : (
                    <span className="sc-qr-caption" style={{ textAlign: 'center' }}>
                      رمز QR غير متوفر حالياً. حوّل المبلغ يدوياً إلى رقم الحساب الظاهر أدناه عبر تطبيق شام كاش.
                    </span>
                  )}
                </div>
                <div className="sc-qr-account">
                  <span className="sc-account-label">رقم حساب شام كاش</span>
                  {info.account_number ? (
                    <div className="sc-qr-account-row">
                      <span className="sc-account-number" dir="ltr">{info.account_number}</span>
                      <button className={`sc-copy-btn ${copied ? 'copied' : ''}`} type="button" onClick={handleCopy}>
                        <span className="sc-symbol" style={{ fontSize: '18px' }}>{copied ? 'check' : 'content_copy'}</span>
                        <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                  ) : (
                    <span className="sc-qr-caption">لم يُحدَّد رقم حساب شام كاش بعد. يرجى التواصل مع الاتحاد.</span>
                  )}
                </div>
                <span className="sc-qr-caption">
                  <span className="sc-symbol" style={{ fontSize: '14px' }}>
                    qr_code_scanner
                  </span>
                  امسح الكود مباشرة عبر تطبيق شام كاش
                </span>
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
                    <p className="sc-error-text" role="alert" ref={(node) => {
                      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}>
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
            <p className="sc-footer-main">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
            <p className="sc-footer-sub">إصدار البطاقة الإلكترونية مؤمَّن ومعتمد رسمياً</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
