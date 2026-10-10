import React, { useState } from 'react';
import '../../style/SelectTicket.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';

/* باقات التذاكر: عدّل الأسعار والمزايا من هنا */
const OPTIONS = [
  {
    id: 1,
    title: 'خريج + مرافقان',
    guestsCount: 2,
    price: 150000,
    features: [
      { icon: 'chair', text: 'مقعد مخصص للخريج في المنصة الرئيسية' },
      { icon: 'group', text: 'مقعدان مخصصان للمرافقين في الصالة الشرفية' },
    ],
    badge: {
      className: 'st-badge-popular',
      dot: true,
      text: 'الأكثر اختياراً من دفعة الهندسة والعلوم',
    },
  },
  {
    id: 2,
    title: 'خريج + ثلاثة مرافقين',
    guestsCount: 3,
    price: 200000,
    features: [
      { icon: 'chair', text: 'مقعد مخصص للخريج في المنصة الرئيسية' },
      { icon: 'groups', text: 'ثلاثة مقاعد للمرافقين في الصالة الشرفية' },
    ],
    badge: {
      className: 'st-badge-family',
      icon: 'family_restroom',
      text: 'باقة العائلة الموسعة',
    },
  },
];

const formatPrice = (value) => value.toLocaleString('en-US');

export default function SelectTicket({ onContinue, onBack }) {
  // الباقة المحددة (الأولى افتراضياً)
  const [selectedOption, setSelectedOption] = useState(1);

  const handleContinue = () => {
    const option = OPTIONS.find((o) => o.id === selectedOption);
    if (onContinue) {
      onContinue({
        optionId: option.id,
        guestsCount: option.guestsCount,
        price: option.price,
      });
    } else {
      alert(`تم اختيار الباقة رقم ${option.id}، والمتابعة إلى الدفع.`);
    }
  };

  // اختيار الباقة بلوحة المفاتيح (Enter أو Space)
  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedOption(id);
    }
  };

  return (
    <div className="st-app-container">
      <div className="st-mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
        <header className="st-header-main">
          <div className="st-header-top">
            <button
              aria-label="الرجوع"
              className="st-icon-btn"
              type="button"
              onClick={() => (onBack ? onBack() : window.history.back())}
            >
              <span className="st-symbol" style={{ fontSize: '22px' }}>
                arrow_forward
              </span>
            </button>

            <h1 className="st-header-title">حفل تخرج جامعة حمص</h1>

            <div className="st-icon-btn static">
              <img className="st-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="st-header-subband">
            <span className="st-subband-title">اختيار التذكرة</span>
            <span className="st-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* محتوى الصفحة الرئيسي */}
        <main className="st-main-stage">
          {/* قسم الترحيب والشعار */}
          <section className="st-hero-card">
            <div className="st-hero-content">
              <div className="st-hero-tag">
                <span className="st-dot"></span>
                <span className="st-tag-text">جامعة حمص • دفعة 2026</span>
              </div>
              <h2 className="st-hero-headline">
                حدّد باقة الحضور المناسبة لك ولعائلتك
              </h2>
              <p className="st-hero-subtext">
                خطوة واحدة وتصبح تذكرتك الرسمية جاهزة
              </p>
            </div>
            <div className="st-hero-logo-box">
              <img
                alt="شعار جامعة حمص"
                className="st-hero-logo-img"
                src={universityLogo}
              />
            </div>
          </section>

          {/* قائمة تذاكر الحضور */}
          <section className="st-options-list" aria-label="باقات التذاكر" role="radiogroup">
            {OPTIONS.map((option) => (
              <div
                key={option.id}
                className={`st-ticket-option ${selectedOption === option.id ? 'st-selected' : ''}`}
                onClick={() => setSelectedOption(option.id)}
                onKeyDown={(e) => handleKeyDown(e, option.id)}
                role="radio"
                aria-checked={selectedOption === option.id}
                tabIndex={0}
              >
                <div className="st-option-top">
                  <div className="st-option-info">
                    <div className="st-option-icon-wrapper">
                      <span className="st-symbol">confirmation_number</span>
                    </div>
                    <div>
                      <h3 className="st-option-title">{option.title}</h3>
                      <div className="st-price-row">
                        <span className="st-price-label">السعر:</span>
                        <span className="st-price-val">{formatPrice(option.price)}</span>
                        <span className="st-price-currency">ل.س</span>
                      </div>
                    </div>
                  </div>
                  <div className="st-radio-circle">
                    <span className="st-symbol" style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      check
                    </span>
                  </div>
                </div>

                <ul className="st-features-list">
                  {option.features.map((f) => (
                    <li className="st-feature-item" key={f.text}>
                      <span className="st-symbol st-feature-icon">{f.icon}</span>
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>

                <div className="st-option-footer">
                  <span className={option.badge.className}>
                    {option.badge.dot && (
                      <span className="st-dot" style={{ width: '6px', height: '6px' }}></span>
                    )}
                    {option.badge.icon && (
                      <span className="st-symbol" style={{ fontSize: '14px' }}>
                        {option.badge.icon}
                      </span>
                    )}
                    {option.badge.text}
                  </span>
                </div>
              </div>
            ))}
          </section>

          {/* قسم التنبيه والسياسات */}
          <section className="st-notice-card">
            <div className="st-notice-icon-bg">
              <span className="st-symbol" style={{ fontSize: '18px', fontWeight: 'bold' }}>
                info
              </span>
            </div>
            <div>
              <h4 className="st-notice-headline">تنبيه هام</h4>
              <p className="st-notice-body">
                لا يمكن تعديل التذكرة أو استرجاع المبلغ بعد تأكيد الدفع، لذا يُرجى التأكد من عدد المرافقين وبيانات الحضور قبل المتابعة.
              </p>
            </div>
          </section>
        </main>

        {/* الشريط السفلي الثابت للإجراء الرئيسي */}
        <div className="st-bottom-dock">
          <button className="st-action-btn" type="button" onClick={handleContinue}>
            <span>تأكيد الاختيار ومتابعة الدفع</span>
            <span className="st-symbol" style={{ fontSize: '20px' }}>
              arrow_back
            </span>
          </button>
          <div className="st-dock-caption">
            الدفع عبر شام كاش بتحويل مباشر، وتُؤكَّد تذكرتك بعد التحقق من الإيصال
          </div>
        </div>
      </div>
    </div>
  );
}