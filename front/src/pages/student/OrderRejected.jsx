import React from 'react';
import '../../style/OrderRejected.css';
import unionLogo from '../../assets/only-logo.png';

export default function OrderRejected({
  rejectionReason = 'لم يتم العثور على رقم العملية في كشف حساب شام كاش المعتمد، أو أن المبلغ المحوّل غير مطابق لقيمة التذكرة المختارة.',
  supportUrl = '', // رابط الدعم الفني (واتساب مثلاً)، وإن كان فارغاً نستخدم onSupportClick
  onResubmit,
  onSupportClick,
}) {
  return (
    <div className="or-app-container">
      <main className="or-mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات، بلا سهم رجوع) */}
        <header className="or-header-main">
          <div className="or-header-top">
            {/* مساحة فارغة بدل سهم الرجوع لتبقى العنوان بالمنتصف */}
            <div className="or-icon-btn static" aria-hidden="true"></div>

            <h1 className="or-header-title">حفل تخرج جامعة حمص</h1>

            <div className="or-icon-btn static">
              <img className="or-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="or-header-subband">
            <span className="or-subband-title">حالة الطلب</span>
            <span className="or-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* محتوى الشاشة */}
        <div className="or-content-body">
          <section className="or-card-box">
            {/* أيقونة الرفض */}
            <div className="or-error-outer-circle">
              <div className="or-error-inner-circle">
                <span className="or-symbol" style={{ fontSize: '24px', fontWeight: '700' }}>
                  close
                </span>
              </div>
            </div>

            {/* شارة حالة الطلب */}
            <div className="or-badge-rejected">
              <span className="or-badge-dot"></span>
              <span className="or-badge-text">الطلب مرفوض</span>
            </div>

            {/* عنوان التنبيه */}
            <h2 className="or-card-headline">تعذّر تأكيد عملية الدفع</h2>
            <p className="or-card-subtext">
              راجعنا بيانات التحويل المرسلة وتبيّن وجود خطأ في مطابقة الإشعار.
            </p>

            {/* صندوق أسباب الرفض والتعليمات */}
            <div className="or-reason-box">
              <div className="or-reason-item">
                <span
                  className="or-symbol"
                  style={{ color: '#ba1a1a', fontSize: '20px', flexShrink: 0, marginTop: '2px' }}
                >
                  error
                </span>
                <div>
                  <span className="or-reason-title">سبب الرفض:</span>
                  <p className="or-reason-desc">{rejectionReason}</p>
                </div>
              </div>

              <div className="or-reason-divider">
                <span
                  className="or-symbol"
                  style={{ color: '#124d44', fontSize: '18px', flexShrink: 0, marginTop: '2px' }}
                >
                  info
                </span>
                <p className="or-reason-desc">
                  يرجى التأكد من كتابة رقم العملية المكتوب في إشعار شام كاش بدقة، ثم إعادة إرسال البيانات.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* الجزء السفلي: الإجراءات والدعم */}
        <div className="or-bottom-dock">
          {/* زر إعادة الإرسال */}
          <button
            className="or-resubmit-btn"
            type="button"
            onClick={() => {
              if (onResubmit) onResubmit();
              else alert('الانتقال لإعادة إرسال بيانات الدفع...');
            }}
          >
            <span className="or-symbol" style={{ fontSize: '20px' }}>
              refresh
            </span>
            <span>إعادة إرسال بيانات الدفع</span>
          </button>

          {/* رابط التواصل مع الدعم الفني */}
          <a
            href={supportUrl || '#support'}
            className="or-support-link"
            {...(supportUrl ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={(e) => {
              if (!supportUrl && onSupportClick) {
                e.preventDefault();
                onSupportClick();
              }
            }}
          >
            <span className="or-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>
              support_agent
            </span>
            <span className="or-support-text">
              هل تواجه مشكلة؟ تواصل مع الدعم الفني للاتحاد
            </span>
          </a>

          {/* التذييل */}
          <footer className="or-footer">
            <p className="or-footer-text">جامعة حمص • فرع حمص لاتحاد الطلبة</p>
          </footer>
        </div>
      </main>
    </div>
  );
}