import React, { useState } from 'react';
import '../../style/ScanSuccessResult.css';
import unionLogo from '../../assets/only-logo.png';

/*
  بيانات تجريبية: لما يجهز الباك إند مرّر نتيجة المسح الحقيقية عبر الخاصية result:
  {
    ticketType: 'graduate' | 'companion',
    holderName, faculty, venue, seat, gate, ticketCode,
    companionsRemaining,   // للخريج فقط: عدد المرافقين المتبقين
    companionOf,           // للمرافق فقط: اسم الخريج
    scannedAt              // تاريخ ISO لوقت المسح
  }
*/
const MOCK_RESULT = {
  ticketType: 'graduate',
  holderName: 'كنان محمد العلي',
  faculty: 'كلية الهندسة الميكانيكية والكهربائية — هندسة الحواسيب',
  venue: 'مدرج الباسل',
  seat: 'A-14',
  gate: 'البوابة الغربية (B)',
  ticketCode: 'HOMS-2026-8849',
  companionsRemaining: 2,
  companionOf: '',
  scannedAt: new Date().toISOString(),
};

/* ٠ لا يوجد، ١ مرافق واحد، ٢ مرافقان، غير ذلك: n مرافقين */
const companionsText = (n) => {
  if (!n) return 'لا يوجد';
  if (n === 1) return 'مرافق واحد';
  if (n === 2) return 'مرافقان';
  return `${n} مرافقين`;
};

const formatTime = (iso) =>
  new Intl.DateTimeFormat('ar-SY-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso)
  );

export default function ScanSuccessResult({
  result = MOCK_RESULT,
  onNextScan,
  onToggleFlash,
}) {
  const [flashOn, setFlashOn] = useState(false);
  const data = { ...MOCK_RESULT, ...result };
  const isGraduate = data.ticketType === 'graduate';

  const handleNext = () => {
    if (onNextScan) onNextScan();
  };

  const handleFlash = () => {
    const next = !flashOn;
    setFlashOn(next);
    if (onToggleFlash) onToggleFlash(next);
  };

  return (
    <div className="scan-res-app-container">
      <div className="scan-res-mobile-frame">
        {/* الهيدر العلوي (نفس بقية الصفحات) */}
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
              <span>تمت المصادقة الرقمية الرسمية بنجاح</span>
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
                <span>الآن — {formatTime(data.scannedAt)}</span>
              </span>
            </div>

            <div>
              <span className="scan-res-label">اسم حامل البطاقة</span>
              <h3 className="scan-res-name">{data.holderName}</h3>
              {data.faculty && <p className="scan-res-faculty">{data.faculty}</p>}
            </div>

            <div className="scan-res-grid">
              <div className="scan-res-cell">
                <span className="scan-res-label">الموقع والمقعد</span>
                <span className="scan-res-value">{data.venue}</span>
                <span className="scan-res-accent">مقعد: {data.seat}</span>
              </div>

              <div className="scan-res-cell">
                {isGraduate ? (
                  <>
                    <span className="scan-res-label">المرافقون المتبقون</span>
                    <span className="scan-res-value">متبقٍ معه</span>
                    <span className="scan-res-accent with-icon">
                      <span className="scan-res-symbol" style={{ fontSize: '18px' }}>group</span>
                      <span>{companionsText(data.companionsRemaining)}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="scan-res-label">مرافق للخريج</span>
                    <span className="scan-res-value">{data.companionOf || '—'}</span>
                  </>
                )}
              </div>
            </div>

            <div className="scan-res-card-footer">
              <span>
                بوابة الدخول: <strong>{data.gate}</strong>
              </span>
              <span className="scan-res-code">#{data.ticketCode}</span>
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