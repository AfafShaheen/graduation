import React from 'react';
import '../../style/MyTicket.css';
import unionLogo from '../../assets/only-logo.png';

export default function MyTicket({
  studentName = 'مجد أحمد العلي',
  faculty = 'كلية الهندسة المعلوماتية',
  universityId = '418902',
  gateAndSeat = 'بوابة (أ) • منصة 12',
  ticketCode = 'HOMS-GRAD-8841-X',
  venue = 'الملعب البلدي • حمص',
  companionsCount = 3,
  qrSrc, // صورة الـ QR الحقيقية (يصدرها الباك إند)، وإلا نعرض شكلاً تمثيلياً
  onDownloadPdf,
  onSaveToWallet,
  onShare,
}) {
  // المشاركة: نستخدم مشاركة الجهاز إن توفرت
  const handleShare = async () => {
    if (onShare) {
      onShare();
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'تذكرتي - حفل تخرج جامعة حمص',
          text: `رمز التذكرة: ${ticketCode}`,
        });
      } catch (err) {
        /* المستخدم ألغى المشاركة */
      }
    }
  };

  const handleDownload = () => {
    if (onDownloadPdf) onDownloadPdf();
    else window.print(); // بديل مؤقت: الطباعة أو الحفظ كـ PDF من المتصفح
  };

  return (
    <div className="tk-app-container">
      <main className="tk-mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات، بلا سهم رجوع) */}
        <header className="tk-header-main">
          <div className="tk-header-top">
            <div className="tk-icon-btn static">
              <img className="tk-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>

            <h1 className="tk-header-title">حفل تخرج جامعة حمص</h1>

            <button
              aria-label="مشاركة التذكرة"
              className="tk-icon-btn"
              type="button"
              onClick={handleShare}
            >
              <span className="tk-symbol" style={{ fontSize: '20px' }}>
                share
              </span>
            </button>
          </div>

          <div className="tk-header-subband">
            <span className="tk-subband-title">تذكرتي</span>
            <span className="tk-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* محتوى الصفحة الرئيسي */}
        <div className="tk-main-stage">
          {/* شريط حالة التذكرة */}
          <div className="tk-status-header">
            <div className="tk-status-group">
              <span className="tk-symbol" style={{ color: '#124d44', fontSize: '20px' }}>
                verified
              </span>
              <span className="tk-status-title">تذكرة الخريج الرسمية</span>
            </div>
            <span className="tk-badge-confirmed">مؤكدة</span>
          </div>

          {/* بطاقة التذكرة الرئيسية */}
          <section className="tk-card-box">
            {/* الشريط العلوي للبطاقة */}
            <div className="tk-card-banner">
              <div className="tk-banner-tag">
                <span className="tk-symbol" style={{ color: '#ffb598', fontSize: '20px' }}>
                  school
                </span>
                <span>الدفعة 44 • 2026</span>
              </div>
              <span className="tk-banner-pill">تذكرة خريج</span>
            </div>

            {/* تفاصيل التذكرة والخريج */}
            <div className="tk-card-body">
              <h2 className="tk-student-name">{studentName}</h2>
              <p className="tk-student-faculty">
                <span className="tk-symbol" style={{ fontSize: '16px' }}>
                  laptop_chromebook
                </span>
                {faculty}
              </p>

              {/* المقعد والرقم الجامعي */}
              <div className="tk-meta-row">
                <div className="tk-meta-col">
                  <span className="tk-meta-label">الرقم الجامعي</span>
                  <span className="tk-meta-value">{universityId}</span>
                </div>
                <div className="tk-meta-divider"></div>
                <div className="tk-meta-col">
                  <span className="tk-meta-label">البوابة والمقعد</span>
                  <span className="tk-meta-value">{gateAndSeat}</span>
                </div>
              </div>

              {/* كود الـ QR للتحقق */}
              <div className="tk-qr-box">
                <div className="tk-qr-relative">
                  {qrSrc ? (
                    <img className="tk-qr-svg" src={qrSrc} alt="رمز QR للتحقق من التذكرة" />
                  ) : (
                    <>
                      {/* شكل تمثيلي مؤقت: مرّر الصورة الحقيقية عبر الخاصية qrSrc */}
                      <svg
                        className="tk-qr-svg"
                        shapeRendering="crispEdges"
                        viewBox="0 0 140 140"
                        aria-label="رمز QR للتحقق من التذكرة"
                      >
                        <rect height="35" rx="4" width="35" x="10" y="10"></rect>
                        <rect fill="#FFFFFF" height="25" rx="2" width="25" x="15" y="15"></rect>
                        <rect height="15" rx="1" width="15" x="20" y="20"></rect>
                        <rect height="35" rx="4" width="35" x="95" y="10"></rect>
                        <rect fill="#FFFFFF" height="25" rx="2" width="25" x="100" y="15"></rect>
                        <rect height="15" rx="1" width="15" x="105" y="20"></rect>
                        <rect height="35" rx="4" width="35" x="10" y="95"></rect>
                        <rect fill="#FFFFFF" height="25" rx="2" width="25" x="15" y="100"></rect>
                        <rect height="15" rx="1" width="15" x="20" y="105"></rect>
                        <rect height="6" width="6" x="52" y="12"></rect>
                        <rect height="6" width="6" x="62" y="12"></rect>
                        <rect height="6" width="10" x="76" y="12"></rect>
                        <rect height="6" width="16" x="52" y="24"></rect>
                        <rect height="14" width="6" x="74" y="24"></rect>
                        <rect height="16" width="6" x="12" y="52"></rect>
                        <rect height="6" width="14" x="24" y="52"></rect>
                        <rect height="14" width="6" x="24" y="64"></rect>
                        <rect height="8" width="8" x="52" y="44"></rect>
                        <rect height="8" width="8" x="64" y="44"></rect>
                        <rect height="8" width="8" x="80" y="44"></rect>
                        <rect height="10" width="10" x="44" y="60"></rect>
                        <rect height="10" width="10" x="86" y="60"></rect>
                        <rect height="8" width="8" x="52" y="80"></rect>
                        <rect height="8" width="8" x="64" y="80"></rect>
                        <rect height="8" width="8" x="80" y="80"></rect>
                        <rect height="6" width="14" x="52" y="95"></rect>
                        <rect height="6" width="12" x="74" y="95"></rect>
                        <rect height="18" width="6" x="52" y="108"></rect>
                        <rect height="6" width="18" x="64" y="116"></rect>
                        <rect height="6" width="16" x="74" y="108"></rect>
                        <rect height="12" width="8" x="96" y="52"></rect>
                        <rect height="6" width="16" x="110" y="52"></rect>
                        <rect height="16" width="6" x="120" y="64"></rect>
                        <rect height="8" width="14" x="98" y="74"></rect>
                        <rect height="6" width="26" x="100" y="95"></rect>
                        <rect height="18" width="12" x="114" y="108"></rect>
                        <rect height="8" width="12" x="96" y="118"></rect>
                      </svg>
                      <div className="tk-qr-center-emblem">
                        <span className="tk-symbol" style={{ color: '#ffb598', fontSize: '18px' }}>
                          school
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <span className="tk-ticket-code">{ticketCode}</span>
              </div>

              <p className="tk-venue-text">{venue}</p>
            </div>
          </section>

          {/* قسم تذاكر المرافقين */}
          <section className="tk-companions-box">
            <div className="tk-companions-header">
              <div className="tk-companions-title-group">
                <span className="tk-symbol" style={{ color: '#124d44', fontSize: '18px' }}>
                  groups
                </span>
                <h3 className="tk-companions-title">تذاكر المرافقين ({companionsCount})</h3>
              </div>
              <span className="tk-companions-hint">
                <span className="tk-symbol" style={{ fontSize: '14px' }}>
                  info
                </span>
                تُفعَّل تلقائياً بعد مسح كود الخريج
              </span>
            </div>

            <div className="tk-companions-grid">
              {Array.from({ length: companionsCount }).map((_, idx) => (
                <div key={idx} className="tk-companion-card">
                  <div className="tk-companion-avatar">
                    <span className="tk-symbol" style={{ fontSize: '16px' }}>
                      person
                    </span>
                  </div>
                  <span className="tk-companion-name">المرافق {idx + 1}</span>
                  <span className="tk-companion-status">قيد الانتظار</span>
                </div>
              ))}
            </div>
          </section>

          {/* أزرار الإجراءات السريعة */}
          <div className="tk-actions-group">
            <button type="button" className="tk-btn-primary" onClick={handleDownload}>
              <span className="tk-symbol" style={{ fontSize: '20px' }}>
                download
              </span>
              <span>تحميل التذكرة بصيغة PDF</span>
            </button>

            <button type="button" className="tk-btn-secondary" onClick={onSaveToWallet}>
              <span className="tk-symbol" style={{ fontSize: '18px' }}>
                account_balance_wallet
              </span>
              <span>حفظ في المحفظة الإلكترونية</span>
            </button>
          </div>

          {/* التذييل المؤسسي */}
          <footer className="tk-footer">
            <p className="tk-footer-main">جامعة حمص • حفل تخرج الدفعة 44</p>
            <p className="tk-footer-sub">بالتعاون مع فرع حمص لاتحاد الطلبة</p>
          </footer>
        </div>
      </main>
    </div>
  );
}