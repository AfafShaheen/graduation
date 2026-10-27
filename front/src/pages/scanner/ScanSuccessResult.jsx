import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../style/ScanSuccessResult.css';
import unionLogo from '../../assets/only-logo.png';

const PREVIEW_RESULT = {
  message: "معاينة ناجحة",
  code_type: "GRADUATE",
};

const formatTime = (date) =>
  new Intl.DateTimeFormat('ar-SY-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    date
  );

export default function ScanSuccessResult({
  result,
  onNextScan,
  onToggleFlash,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [flashOn, setFlashOn] = useState(false);
  const [scanTime] = useState(() => new Date());

  const data = result || location.state?.result || PREVIEW_RESULT;
  const isGraduate = data.code_type !== 'COMPANION';

  const handleNext = () => {
    if (onNextScan) {
      onNextScan();
    } else {
      navigate('/scanner/scan');
    }
  };

  const handleFlash = () => {
    const next = !flashOn;
    setFlashOn(next);
    if (onToggleFlash) onToggleFlash(next);
  };

  return (
    <div className="scan-res-app-container">
      <div className="scan-res-mobile-frame">
        {/* الهيدر العلوي */}
        <header className="scan-res-header">
          <div className="scan-res-header-top">
            <button
              type="button"
              className={`scan-res-flash-btn ${flashOn ? 'on' : ''}`}
              aria-label={flashOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'}
              aria-pressed={flashOn}
              onClick={handleFlash}
            >
              <span className="scan-res-symbol" style={{ fontSize: '20px' }}>
                {flashOn ? 'flash_on' : 'flash_off'}
              </span>
            </button>

            <h1 className="scan-res-header-title">حفل تخرج جامعة حمص</h1>

            <div className="scan-res-icon-slot">
              <img className="scan-res-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="scan-res-subband">
            <span className="scan-res-subband-title">
              <span className="scan-res-symbol" style={{ fontSize: '18px' }}>qr_code_scanner</span>
              ماسح التذاكر
            </span>
            <span className="scan-res-badge-batch">دفعة 2026</span>
          </div>
        </header>

        {/* المحتوى */}
        <div className="scan-res-content">
          {/* حالة الدخول */}
          <section className="scan-res-status-section" role="status" aria-live="polite">
            <div className="scan-res-checkmark-wrapper">
              <div className="scan-res-pulse-ring"></div>
              <div className="scan-res-checkmark-circle">
                <span
                  className="scan-res-symbol"
                  style={{ fontSize: '52px', fontVariationSettings: "'FILL' 1, 'wght' 700" }}
                >
                  check
                </span>
              </div>
            </div>

            <h2 className="scan-res-headline">دخول مقبول</h2>

            <div className="scan-res-verified-pill">
              <span
                className="scan-res-symbol"
                style={{ color: '#ffb598', fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
              >
                verified
              </span>
              <span>{data.message || 'تمت المصادقة الرقمية الرسمية بنجاح'}</span>
            </div>
          </section>

          {/* بطاقة معلومات التذكرة */}
          <section className="scan-res-card">
            <div className="scan-res-card-divider">
              <span className={`scan-res-type-chip ${isGraduate ? 'graduate' : 'companion'}`}>
                <span className="scan-res-symbol" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>
                  {isGraduate ? 'school' : 'group'}
                </span>
                <span>{isGraduate ? 'خريج أصيل' : 'مرافق'}</span>
              </span>
              <span className="scan-res-time">
                <span className="scan-res-symbol" style={{ fontSize: '16px', color: '#ca4b00' }}>schedule</span>
                <span>الآن — {formatTime(scanTime)}</span>
              </span>
            </div>
          </section>

          {/* زر المسح التالي */}
          <footer className="scan-res-footer">
            <button type="button" className="scan-res-next-btn" onClick={handleNext}>
              <span>امسح التالي</span>
              <span className="scan-res-symbol" style={{ fontSize: '26px' }}>arrow_back</span>
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
