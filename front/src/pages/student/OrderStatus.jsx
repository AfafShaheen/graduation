import React from 'react';
import '../../style/OrderStatus.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';

/* تنسيق التاريخ والوقت بالعربية مع أرقام إنجليزية */
const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export default function OrderStatus({
  transactionId = '948271503',
  amountPaid = 150000, // رقم (150000) أو نص جاهز ("150,000 ل.س")
  orderDate, // تاريخ ISO أو Date، وإن لم يُمرَّر نستخدم الوقت الحالي
  whatsappGroupUrl = 'https://whatsapp.com', // بدّله برابط المجموعة الحقيقي
}) {
  const amountText =
    typeof amountPaid === 'number'
      ? `${amountPaid.toLocaleString('en-US')} ل.س`
      : amountPaid;
  const dateText = formatDate(orderDate || new Date());

  return (
    <div className="os-app-container">
      <main className="os-mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
        <header className="os-header-main">
          <div className="os-header-top">
            {/* مساحة فارغة بدل سهم الرجوع لتبقى العنوان بالمنتصف */}
            <div className="os-icon-btn static" aria-hidden="true"></div>

            <h1 className="os-header-title">حفل تخرج جامعة حمص</h1>

            <div className="os-icon-btn static">
              <img className="os-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="os-header-subband">
            <span className="os-subband-title">حالة الطلب</span>
            <span className="os-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* محتوى الشاشة */}
        <div className="os-main-stage">
          {/* شريط الحالة */}
          <div className="os-status-bar">
            <div className="os-live-status">
              <span className="os-pulse-dot"></span>
              <span>قيد المراجعة</span>
            </div>
          </div>

          {/* بطاقة تفاصيل الطلب الرئيسية */}
          <section className="os-card-box">
            {/* الشعار */}
            <div className="os-logo-wrapper">
              <img alt="شعار جامعة حمص" className="os-logo-img" src={universityLogo} />
            </div>

            {/* شارة حالة المعالجة */}
            <div className="os-badge-pending">
              <span className="os-symbol os-spin-icon">hourglass_top</span>
              <span>قيد المعالجة</span>
            </div>

            {/* العنوان والتوضيح */}
            <h2 className="os-card-headline">تم استلام طلبك وجارٍ التحقق منه</h2>
            <p className="os-card-subtext">
              يقوم الاتحاد بمراجعة دفعتك والتأكد من إشعار التحويل من تطبيق{' '}
              <strong>شام كاش</strong>. تستغرق العملية عادةً من{' '}
              <span className="highlight">ساعتين إلى 24 ساعة</span>.
            </p>

            {/* الفاصل المقطع */}
            <div className="os-dashed-divider"></div>

            {/* تفاصيل الفاتورة */}
            <div className="os-meta-list">
              <div className="os-meta-row">
                <span className="os-meta-label">
                  <span className="os-symbol" style={{ fontSize: '16px', color: '#124d44' }}>
                    tag
                  </span>
                  رقم العملية:
                </span>
                <span className="os-meta-val mono">#{transactionId}</span>
              </div>

              <div className="os-meta-row">
                <span className="os-meta-label">
                  <span className="os-symbol" style={{ fontSize: '16px', color: '#124d44' }}>
                    payments
                  </span>
                  المبلغ المدفوع:
                </span>
                <span className="os-meta-val primary">{amountText}</span>
              </div>

              <div className="os-meta-row">
                <span className="os-meta-label">
                  <span className="os-symbol" style={{ fontSize: '16px', color: '#124d44' }}>
                    calendar_today
                  </span>
                  تاريخ الطلب:
                </span>
                <span className="os-meta-val">{dateText}</span>
              </div>
            </div>

            {/* الفاصل المقطع */}
            <div className="os-dashed-divider"></div>

            {/* قسم مجتمع الواتساب */}
            <div className="os-community-section">
              <div className="os-community-header">
                <div>
                  <h3 className="os-community-title">تجمّع خريجي الدفعة 44</h3>
                  <span className="os-community-subtitle">القناة الرسمية المعتمدة</span>
                </div>
                <div className="os-community-icon-bg">
                  <span className="os-symbol" style={{ fontSize: '24px' }}>
                    groups
                  </span>
                </div>
              </div>

              <p className="os-community-text">
                تابع آخر إعلانات البروفات ومواعيد استلام روب التخرج أولاً بأول عبر مجموعة واتساب الرسمية.
              </p>

              <a
                className="os-whatsapp-btn"
                href={whatsappGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="os-symbol" style={{ fontSize: '20px' }}>
                  forum
                </span>
                <span>الانضمام إلى مجموعة الحفل</span>
              </a>
            </div>
          </section>

          {/* شريط الاطمئنان */}
          <div className="os-reassurance-bar">
            <span className="os-symbol" style={{ color: '#ca4b00', fontSize: '19px', flexShrink: 0 }}>
              notifications_active
            </span>
            <p className="os-reassurance-text">
              سيصلك إشعار عبر الرسائل النصية وتطبيق شام كاش فور تدقيق طلبك.
            </p>
          </div>
        </div>

        {/* التذييل المؤسسي */}
        <footer className="os-footer">
          <p className="os-footer-main">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
          <p className="os-footer-sub">لجنة تنظيم وتنسيق حفلات التخرج المركزية</p>
        </footer>
      </main>
    </div>
  );
}