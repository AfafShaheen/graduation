import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../style/WrongCeremoniesWarning.css';
import unionLogo from '../../assets/only-logo.png';
import { getScannerEvent } from '../../api/session';

export default function WrongCeremoniesWarning({
  onNextScan,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 80, 120]);
    }
  }, []);

  const result = location.state?.result;
  const currentCeremony = location.state?.event?.name ?? getScannerEvent()?.name ?? 'حفل التخرج';

  const handleScanNext = () => {
    if (onNextScan) {
      onNextScan();
    } else {
      navigate('/scanner/scan');
    }
  };

  return (
    <div className="wrong-cer-app-container">
      <div className="wrong-cer-mobile-frame">
        {/* الهيدر */}
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
              {result?.message || 'تذكرة الخريج سارية وصحيحة نظامياً، ولكنها مخصصة لحفل أكاديمي مجدول في موعد آخر.'}
            </p>

            <div className="wrong-cer-info-panel">
              <div className="wrong-cer-compare">
                <div className="wrong-cer-compare-row">
                  <div className="wrong-cer-compare-label">
                    <span className="wrong-cer-symbol wrong-cer-orange">event_busy</span>
                    <span>الحفل المخصص:</span>
                  </div>
                  <div className="wrong-cer-compare-value orange">
                    {/* D13: backend does not return personal data */}
                    —
                    <small>—</small>
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
                  {/* D13: backend does not return personal data */}
                  <span className="wrong-cer-grad-name">—</span>
                </div>
                <div className="wrong-cer-grad-row">
                  <span className="wrong-cer-muted">الكلية والقسم:</span>
                  {/* D13: backend does not return personal data */}
                  <span className="wrong-cer-grad-faculty">—</span>
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
