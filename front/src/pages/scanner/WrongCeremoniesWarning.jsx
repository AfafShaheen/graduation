import React, { useEffect } from 'react';
import '../../style/WrongCeremoniesWarning.css';
import unionLogo from '../../assets/only-logo.png';

/* ==========================================================================
   شاشة تنبيه: التذكرة تابعة لحفل ثاني (.wrong-cer-*)
   ========================================================================== */

export default function WrongCeremoniesWarning({
  currentCeremony = 'حفل الكليات الطبية', // الحفل الجاري عليه المسح الآن
  ticketData = {
    // مؤقت: يجي من الباك إند بعد المسح
    name: 'م. كنان باسل المحمود',
    faculty: 'الهندسة المدنية - الإنشائية',
    ceremonyName: 'حفل كليات الهندسة',
    ceremonyDate: 'الأربعاء القادم (10:00 ص)',
  },
  onNextScan,
}) {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 80, 120]);
    }
  }, []);

  const handleScanNext = () => {
    if (onNextScan) onNextScan();
  };

  return (
    <div className="wrong-cer-app-container">
      <div className="wrong-cer-mobile-frame">
        {/* الهيدر (نفس هيدر شاشة المسح) */}
        <header className="wrong-cer-header">
          <div className="wrong-cer-header-info">
            <img className="wrong-cer-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            <div>
              <h1 className="wrong-cer-header-title">ماسح التذاكر — جامعة حمص</h1>
              <p className="wrong-cer-header-sub">{currentCeremony}</p>
            </div>
          </div>
        </header>

        {/* شريط الحفل الجاري */}
        <div className="wrong-cer-subbar">
          <div className="wrong-cer-subbar-main">
            <span className="wrong-cer-pulse-dot"></span>
            <span>مباشر: {currentCeremony}</span>
          </div>
        </div>

        <main className="wrong-cer-main">
          <div className="wrong-cer-card" role="alert">
            <div className="wrong-cer-icon-wrapper">
              <span className="wrong-cer-symbol fill" style={{ fontSize: '44px' }}>warning</span>
            </div>

            <span className="wrong-cer-pill">تنبيه: اختلاف الحفل</span>
            <h2 className="wrong-cer-title">هالرمز تابع لحفل ثاني!</h2>
            <p className="wrong-cer-desc">
              تذكرة الخريج سارية وصحيحة نظامياً، ولكنها مخصصة لحفل أكاديمي مجدول في موعد آخر.
            </p>

            <div className="wrong-cer-info-panel">
              <div className="wrong-cer-compare">
                <div className="wrong-cer-compare-row">
                  <div className="wrong-cer-compare-label">
                    <span className="wrong-cer-symbol wrong-cer-orange">event_busy</span>
                    <span>الحفل المخصص:</span>
                  </div>
                  <div className="wrong-cer-compare-value orange">
                    {ticketData.ceremonyName}
                    <small>{ticketData.ceremonyDate}</small>
                  </div>
                </div>

                <div className="wrong-cer-compare-row">
                  <div className="wrong-cer-compare-label">
                    <span className="wrong-cer-symbol wrong-cer-green">how_to_reg</span>
                    <span>الحفل الجاري الآن:</span>
                  </div>
                  <div className="wrong-cer-compare-value green">{currentCeremony}</div>
                </div>
              </div>

              <div className="wrong-cer-grad">
                <div className="wrong-cer-grad-row">
                  <span className="wrong-cer-muted">اسم الخريج المسجل:</span>
                  <span className="wrong-cer-grad-name">{ticketData.name}</span>
                </div>
                <div className="wrong-cer-grad-row">
                  <span className="wrong-cer-muted">الكلية والقسم:</span>
                  <span className="wrong-cer-grad-faculty">{ticketData.faculty}</span>
                </div>
              </div>
            </div>

            <div className="wrong-cer-guide">
              <span className="wrong-cer-symbol" style={{ fontSize: '18px' }}>info</span>
              <p>يُرجى إرشاد الخريج أو ذويه للعودة في التاريخ المعتمد بالدعوة الرسمية.</p>
            </div>
          </div>
        </main>

        <footer className="wrong-cer-footer">
          <button type="button" className="wrong-cer-next-btn" onClick={handleScanNext}>
            <span>امسح التالي</span>
            <span className="wrong-cer-symbol" style={{ fontSize: '22px' }}>qr_code_scanner</span>
          </button>
          <p className="wrong-cer-ready">
            <span className="wrong-cer-ready-dot"></span>
            جاهز لقراءة التذكرة التالية
          </p>
        </footer>
      </div>
    </div>
  );
}