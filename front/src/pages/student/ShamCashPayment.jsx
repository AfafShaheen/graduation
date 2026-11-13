import StageHeader from '../../components/StageHeader';
import { PAYMENT_WARNING_TEXT } from '../../config/stageTexts';
import { PAYMENT_STEPS } from '../../config/paymentSteps';
import { guideKeyOf } from '../../config/guideKeys';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../style/ShamCashPayment.css';
import '../../style/BrandHeader.css';
import { getPaymentInfo, submitPayment, getShamcashQr } from '../../api/graduate';
import { getGraduateToken } from '../../api/session';
import { parseAmount, formatAmount } from '../../utils/amount.js';
import GraduateFooter from '../../components/GraduateFooter';
import PaymentConfirmDialog from '../../components/PaymentConfirmDialog';
import { validateTransactionId } from '../../utils/payments';
import { senderNameFromNote, paymentHelpHref } from '../../utils/paymentFill';
import useContactPhone from '../../hooks/useContactPhone';
import { cleanServerMessage } from '../../utils/cleanServerMessage.js';

/* تحويل الأرقام العربية لإنجليزية وإزالة أي رمز غير رقمي */
const toDigits = (value) =>
  value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

/* Arabic-Indic digits → Latin. الحالة (uppercase/lowercase) محفوظة كما كتبها الخريج (D4). */
const normalizeTx = (value) =>
  String(value ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

/* backend field name → this form's field name */
const SERVER_FIELD_MAP = {
  transaction_number: 'transactionId',
  amount: 'transferAmount',
  sender_name: 'senderName',
};

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const makeValidators = () => ({
  transactionId: (v) => validateTransactionId(v),
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
  const [noteCopied, setNoteCopied] = useState(false);
  const contactPhone = useContactPhone();
  const [confirming, setConfirming] = useState(false);
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
          // his own name is already known: he only changes it when his Sham Cash name differs
          senderName: prev.senderName || senderNameFromNote(result.note_text),
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

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
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
  };

  const handleCopy = async () => {
    const accountValue = info?.account_number ? String(info.account_number) : '';
    if (!accountValue) return;
    await copyText(accountValue);
    setCopied(true);
    setTimeout(() => mounted.current && setCopied(false), 2000);
  };

  const handleCopyNote = async () => {
    if (!info?.note_text) return;
    await copyText(info.note_text);
    setNoteCopied(true);
    setTimeout(() => mounted.current && setNoteCopied(false), 2000);
  };

  const handleInputChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;
    if (name === 'transferAmount') value = toDigits(value);

    setFormData((prev) => ({ ...prev, [name]: value }));
    if ((submitted || errors[name]) && validators[name]) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const helpHref = paymentHelpHref(contactPhone, info?.note_text);

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

    setConfirming(true);
  };

  const doSubmit = async () => {
    if (submitting) return;
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
      if (mounted.current) {
        setSubmitting(false);
        setConfirming(false);
      }
    }
  };

  return (
    <div className="sc-app-container">
      <main className="sc-mobile-shell">
        <StageHeader current="payment" canChangePackage onBack={() => (onBack ? onBack() : window.history.back())} />

        <div className="sc-main-stage">
          <div className="sc-status-row">
            <span className="sc-status-badge">
              <span className="sc-status-dot"></span>
              بوابة السداد الإلكتروني المعتمدة
            </span>
          </div>

          {/* the same four steps as the guide, in front of the fields they concern */}
          <ol className="sc-steps" aria-label="خطوات الدفع">
            {PAYMENT_STEPS.map((text, i) => (
              <li key={text} className="sc-step">
                <span className="sc-step-no" aria-hidden="true">{i + 1}</span>
                <span className="sc-step-body">
                  {guideKeyOf(text) && <strong className="sc-step-key">{guideKeyOf(text)}</strong>}
                  <span className="sc-step-text">{text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="sc-steps-warning" role="note">
            <span className="sc-symbol" aria-hidden="true">warning</span>
            <span>{PAYMENT_WARNING_TEXT}</span>
          </p>


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
                  <div className="sc-notice-body">
                    <p className="sc-notice-text">{info.note_instruction}</p>
                    {info.note_text && (
                      <div className="sc-note-copy">
                        <span className="sc-note-copy-text">{info.note_text}</span>
                        <button type="button" className="sc-note-copy-btn" onClick={handleCopyNote}>
                          {noteCopied ? 'تم النسخ' : 'نسخ'}
                        </button>
                      </div>
                    )}
                  </div>
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
                      <span>رقم العملية</span>
                      <span className="sc-star">*</span>
                    </label>
                    <div className="sc-input-wrapper">
                      <input
                        id="transactionId"
                        name="transactionId"
                        type="text"
                        inputMode="text"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        dir="ltr"
                        maxLength={100}
                        autoComplete="off"
                        className={`sc-input ${errors.transactionId ? 'error' : ''}`}
                        placeholder="مثال: Ab12-9x"
                        value={formData.transactionId}
                        onChange={handleInputChange}
                        aria-invalid={!!errors.transactionId}
                      />
                      <span className="sc-symbol sc-input-icon-left">pin</span>
                    </div>
                    <p className="sc-field-hint" style={{ margin: '4px 0 0', fontSize: '12px', color: '#725b51' }}>
                      يظهر في إشعار التحويل بعد نجاحه في تطبيق شام كاش. انسخه كما هو (حروف إنجليزية وأرقام وشرطة، بدون مسافات).
                    </p>
                    <FieldError message={errors.transactionId} />
                  </div>

                  <div className="sc-field-group">
                    <label className="sc-label" htmlFor="transferAmount">
                      <span>المبلغ الذي حوّلته (ل.س)</span>
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
                      <span>اسمك في شام كاش</span>
                      <span className="sc-star">*</span>
                    </label>
                    <div className="sc-input-wrapper">
                      <input
                        id="senderName"
                        name="senderName"
                        type="text"
                        autoComplete="off"
                        className={`sc-input ${errors.senderName ? 'error' : ''}`}
                        placeholder="اسم المستخدم الذي أرسلت منه الحوالة"
                        value={formData.senderName}
                        onChange={handleInputChange}
                        aria-invalid={!!errors.senderName}
                      />
                      <span className="sc-symbol sc-input-icon-left">person</span>
                    </div>
                    <p className="sc-field-hint" style={{ margin: '4px 0 0', fontSize: '12px', color: '#725b51' }}>
                      هذا اسمك كما نعرفه. غيّره إن كان الاسم الظاهر في حسابك بشام كاش مختلفاً.
                    </p>
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

                  <button
                    className="sc-secondary-btn"
                    type="button"
                    disabled={submitting}
                    onClick={() => navigate('/tickets')}
                  >
                    <span className="sc-symbol">arrow_forward</span>
                    <span>تغيير الباقة والرجوع لاختيار التذكرة</span>
                  </button>

                  {helpHref && (
                    <a className="sc-help-link" href={helpHref} target="_blank" rel="noopener noreferrer">
                      لا تفهم شيئاً هنا؟ اطلب مساعدتنا على واتساب
                    </a>
                  )}
                </form>

                <PaymentConfirmDialog
                  open={confirming}
                  busy={submitting}
                  onCancel={() => setConfirming(false)}
                  onConfirm={doSubmit}
                  rows={[
                    { label: 'رقم العملية', value: normalizeTx(formData.transactionId), ltr: true },
                    { label: 'المبلغ المحوّل', value: `${Number(parseAmount(formData.transferAmount) || 0).toLocaleString('en-US')} ل.س` },
                    { label: 'اسم المرسل', value: formData.senderName.trim().replace(/\s+/g, ' ') },
                  ]}
                />
              </div>
            </section>
          )}

          <GraduateFooter />
        </div>
      </main>
    </div>
  );
}