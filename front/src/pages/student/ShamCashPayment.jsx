import React, { useState, useRef, useEffect } from 'react';
import '../../style/ShamCashPayment.css';
import unionLogo from '../../assets/only-logo.png';

/* رقم حساب الاتحاد على شام كاش: بدّله بالرقم الحقيقي */
const ACCOUNT_NUMBER = '011-8934215';

const LETTERS = /^[\p{L}\s]+$/u; // حروف (عربية أو لاتينية) ومسافات فقط
const TX_ID = /^[A-Za-z0-9-]+$/; // أرقام وحروف وشرطة، بدون مسافات

const formatMoney = (value) => Number(value).toLocaleString('en-US');

/* تحويل الأرقام العربية لإنجليزية وإزالة أي رمز غير رقمي */
const toDigits = (value) =>
  value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

/* كل دالة ترجع نص الخطأ، أو نص فاضي إذا القيمة صحيحة */
const makeValidators = (amount) => ({
  transactionId: (v) => {
    const t = v.trim();
    if (!t) return 'يرجى إدخال رقم العملية';
    if (!TX_ID.test(t)) return 'رقم العملية يجب ألا يحتوي على مسافات أو رموز';
    return '';
  },
  transferAmount: (v) => {
    const t = toDigits(v);
    if (!t) return 'يرجى إدخال المبلغ المحوّل';
    if (Number(t) < amount) {
      return `يجب ألا يقل المبلغ المحوّل عن ${formatMoney(amount)} ل.س`;
    }
    return '';
  },
  senderName: (v) => {
    const t = v.trim().replace(/\s+/g, ' ');
    if (!t) return 'يرجى إدخال اسم المرسل';
    if (!LETTERS.test(t)) return 'يجب أن يتكون الاسم من حروف فقط';
    if (t.split(' ').length < 2) return 'يرجى كتابة الاسم والكنية (كلمتان على الأقل)';
    return '';
  },
});

/* معرّف كل حقل، لنرجّع الفوكس لأول حقل فيه خطأ */
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

export default function ShamCashPayment({ amount = 150000, qrSrc, onBack, onSuccess }) {
  // نقبل المبلغ كرقم (150000) أو كنص قديم ("150,000 ل.س")
  const amountValue =
    typeof amount === 'number' ? amount : Number(String(amount).replace(/\D/g, '')) || 0;
  const validators = makeValidators(amountValue);

  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    transactionId: '',
    transferAmount: String(amountValue),
    senderName: '',
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false); // الأخطاء ما بتبين إلا بعد أول ضغطة على الزر
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleCopy = async () => {
    const digitsOnly = ACCOUNT_NUMBER;
    try {
      await navigator.clipboard.writeText(digitsOnly);
    } catch (err) {
      // احتياط للمتصفحات أو الاتصالات غير الآمنة
      const el = document.createElement('textarea');
      el.value = digitsOnly;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } catch (e) {
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
    if (name === 'transferAmount') value = toDigits(value); // أرقام فقط

    setFormData((prev) => ({ ...prev, [name]: value }));
    // بعد أول ضغطة على الزر، الخطأ بيتحدّث مباشرة أثناء الكتابة
    if (submitted) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmitting) return;

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

    setIsSubmitting(true);
    setShowSuccess(true);

    setTimeout(() => {
      if (!mounted.current) return;
      setIsSubmitting(false);
      const payload = {
        transactionId: formData.transactionId.trim(),
        transferAmount: Number(toDigits(formData.transferAmount)),
        senderName: formData.senderName.trim().replace(/\s+/g, ' '),
      };
      if (onSuccess) onSuccess(payload);
      else alert('تم إرسال بيانات الدفع بنجاح لتأكيد الحجز!');
    }, 2000);
  };

  return (
    <div className="sc-app-container">
      <main className="sc-mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
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

        {/* محتوى الشاشة */}
        <div className="sc-main-stage">
          {/* شريط الحالة */}
          <div className="sc-status-row">
            <span className="sc-status-badge">
              <span className="sc-status-dot"></span>
              بوابة السداد الإلكتروني المعتمدة
            </span>
          </div>

          {/* البطاقة الرئيسية الموحدة */}
          <section className="sc-card-box">
            {/* الجهة المستقبلة */}
            <div className="sc-recipient-header">
              <span className="sc-recipient-subtitle">الحساب المعتمد للاستلام</span>
              <h2 className="sc-recipient-title">
                الاتحاد الوطني لطلبة سورية - حساب حفل التخرج
              </h2>
            </div>

            {/* كود الـ QR */}
            <div className="sc-qr-section">
              <div className="sc-qr-box">
                {qrSrc ? (
                  <img className="sc-qr-svg" src={qrSrc} alt="QR كود التحويل عبر شام كاش" />
                ) : (
                  /* شكل تمثيلي مؤقت: مرّر الصورة الحقيقية عبر الخاصية qrSrc */
                  <svg
                    aria-label="QR كود التحويل عبر شام كاش"
                    className="sc-qr-svg"
                    viewBox="0 0 100 100"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect fill="#124D44" height="26" rx="3" width="26" x="5" y="5"></rect>
                    <rect fill="#FFFFFF" height="18" rx="2" width="18" x="9" y="9"></rect>
                    <rect fill="#124D44" height="10" rx="1.5" width="10" x="13" y="13"></rect>
                    <rect fill="#124D44" height="26" rx="3" width="26" x="69" y="5"></rect>
                    <rect fill="#FFFFFF" height="18" rx="2" width="18" x="73" y="9"></rect>
                    <rect fill="#124D44" height="10" rx="1.5" width="10" x="77" y="13"></rect>
                    <rect fill="#124D44" height="26" rx="3" width="26" x="5" y="69"></rect>
                    <rect fill="#FFFFFF" height="18" rx="2" width="18" x="9" y="73"></rect>
                    <rect fill="#124D44" height="10" rx="1.5" width="10" x="13" y="77"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="36" y="8"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="46" y="8"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="56" y="8"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="36" y="18"></rect>
                    <rect fill="#CA4B00" height="7" rx="1" width="7" x="46" y="24"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="56" y="18"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="8" y="36"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="18" y="36"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="26" y="44"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="8" y="48"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="18" y="56"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="36" y="36"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="46" y="36"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="56" y="36"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="68" y="36"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="78" y="44"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="86" y="36"></rect>
                    <rect fill="#CA4B00" height="6" rx="1" width="6" x="36" y="48"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="46" y="48"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="58" y="48"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="68" y="56"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="84" y="56"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="36" y="60"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="46" y="62"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="56" y="60"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="36" y="74"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="46" y="74"></rect>
                    <rect fill="#124D44" height="5" rx="1" width="5" x="56" y="82"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="68" y="72"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="78" y="72"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="86" y="80"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="68" y="84"></rect>
                    <rect fill="#124D44" height="6" rx="1" width="6" x="78" y="84"></rect>
                  </svg>
                )}
              </div>
              <span className="sc-qr-caption">
                <span className="sc-symbol" style={{ fontSize: '14px' }}>
                  qr_code_scanner
                </span>
                امسح الكود مباشرة عبر تطبيق شام كاش
              </span>
            </div>

            {/* شريط رقم الحساب والنسخ */}
            <div className="sc-account-strip">
              <div className="sc-account-details">
                <span className="sc-account-label">رقم الحساب المستلم</span>
                <span className="sc-account-number">{ACCOUNT_NUMBER}</span>
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

            {/* المبلغ المطلوب */}
            <div className="sc-amount-banner">
              <span className="sc-amount-label">المبلغ المطلوب:</span>
              <span className="sc-amount-value">{formatMoney(amountValue)} ل.س</span>
            </div>

            {/* التنبيه المباشر */}
            <div className="sc-notice-box">
              <span className="sc-symbol sc-notice-icon">info</span>
              <p className="sc-notice-text">
                اكتب رقمك الجامعي في خانة الملاحظات عند التحويل
              </p>
            </div>

            {/* نموذج إدخال بيانات العملية */}
            <div className="sc-form-section">
              <div className="sc-form-header">
                <span className="sc-symbol" style={{ color: '#ca4b00' }}>
                  receipt_long
                </span>
                <h3 className="sc-form-title">بيانات التحويل للتأكيد</h3>
              </div>

              <form className="sc-form-body" onSubmit={handleSubmit} noValidate autoComplete="off">
                {/* حقل رقم العملية */}
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

                {/* حقل المبلغ المحوّل */}
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
                </div>

                {/* حقل اسم المرسل */}
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

                {/* شريط الإشعار بنجاح الإرسال */}
                {showSuccess && (
                  <div className="sc-success-banner" role="status">
                    <span className="sc-symbol" style={{ fontSize: '22px' }}>
                      check_circle
                    </span>
                    <span>تم تسجيل البيانات بنجاح، جارٍ التحقق من الإيصال...</span>
                  </div>
                )}

                {/* زر الإرسال الرئيسي */}
                <button
                  className={`sc-submit-btn ${isSubmitting ? 'disabled' : ''}`}
                  type="submit"
                  disabled={isSubmitting}
                >
                  <span>{isSubmitting ? 'جارٍ الإرسال...' : 'إرسال بيانات الدفع'}</span>
                  <span className="sc-symbol">send</span>
                </button>
              </form>
            </div>
          </section>

          {/* التذييل */}
          <footer className="sc-footer">
            <p className="sc-footer-main">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
            <p className="sc-footer-sub">إصدار البطاقة الإلكترونية مؤمَّن ومعتمد رسمياً</p>
          </footer>
        </div>
      </main>
    </div>
  );
}