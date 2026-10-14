import React, { useState, useEffect, useRef } from 'react';
import '../../style/ScannerCamera.css';
import unionLogo from '../../assets/only-logo.png';

/* ==========================================================================
   شاشة المسح الميدانية (الماسح)
   بنفس نمط باقي الواجهات: ألوان وخط وهيدر الصفحات الأخرى، وكل التنسيق بالـ CSS
   ========================================================================== */

export default function ScannerCamera({
  onLogout,
  onManualEntry, // اختياري: (code) => اربطها بالباك إند لتأكيد الحضور يدوياً
  initialCount = 142, // مؤقت: عدد من تم مسحهم، يجي من الباك إند لاحقاً
}) {
  const [isTorchActive, setIsTorchActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [scanCount, setScanCount] = useState(initialCount);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef(null);

  const toggleTorch = () => setIsTorchActive((prev) => !prev);
  const toggleMute = () => setIsMuted((prev) => !prev);

  const closeModal = () => {
    setIsModalOpen(false);
    setManualCode('');
    setManualError('');
  };

  /* تنظيف المؤقت عند إغلاق الشاشة */
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* Escape بيسكّر نافذة الإدخال اليدوي */
  useEffect(() => {
    if (!isModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) {
      setManualError('أدخل رقم التذكرة أو الرقم الجامعي');
      return;
    }

    if (onManualEntry) onManualEntry(code);
    closeModal();
    setScanCount((prev) => prev + 1);

    // إظهار الإشعار التفاعلي
    setShowToast(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), 2500);
  };

  return (
    <div className="scan-cam-app-container">
      <div className="scan-cam-mobile-frame">
        {/* الهيدر العلوي (نفس هيدر باقي الصفحات) */}
        <header className="scan-cam-header">
          <div className="scan-cam-header-info">
            <img className="scan-cam-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            <div>
              <h1 className="scan-cam-header-title">ماسح التذاكر — جامعة حمص</h1>
              <p className="scan-cam-header-sub">حفل كليات الهندسة — دفعة 2026</p>
            </div>
          </div>

          <div className="scan-cam-header-actions">
            <button
              type="button"
              className={`scan-cam-icon-btn ${isTorchActive ? 'active' : ''}`}
              aria-label="تشغيل الفلاش"
              aria-pressed={isTorchActive}
              onClick={toggleTorch}
            >
              <span className="scan-cam-symbol">flash_on</span>
            </button>
            <button
              type="button"
              className="scan-cam-icon-btn"
              aria-label="تسجيل الخروج"
              onClick={onLogout}
            >
              <span className="scan-cam-symbol">logout</span>
            </button>
          </div>
        </header>

        {/* شريط حالة الاتصال */}
        <div className="scan-cam-status-bar">
          <div className="scan-cam-status-main">
            <span className="scan-cam-pulse-dot">
              <span className="scan-cam-pulse-ring"></span>
              <span className="scan-cam-pulse-core"></span>
            </span>
            <span className="scan-cam-status-text">متصل - البوابة A (المدرج الكبير)</span>
          </div>

          <div className="scan-cam-sync-badge">
            <span className="scan-cam-symbol" style={{ fontSize: '14px' }}>sensors</span>
            <span>تزامن مباشر</span>
          </div>
        </div>

        {/* منطقة الكاميرا */}
        <main className="scan-cam-viewfinder-zone">
          <div className="scan-cam-prompt-card">
            <div className="scan-cam-prompt-pill">
              <span className="scan-cam-symbol scan-cam-accent">center_focus_strong</span>
              <p>وجّه الكاميرا نحو رمز QR على بطاقة الخريج</p>
            </div>
          </div>

          {/* مربع التوجيه (1:1) */}
          <div className="scan-cam-reticle-box">
            <div className="scan-cam-reticle-glow"></div>
            <div className="scan-cam-reticle-frame">
              <div className="scan-cam-corner scan-cam-corner-tr"></div>
              <div className="scan-cam-corner scan-cam-corner-tl"></div>
              <div className="scan-cam-corner scan-cam-corner-br"></div>
              <div className="scan-cam-corner scan-cam-corner-bl"></div>

              <div className="scan-cam-reticle-watermark">
                <span className="scan-cam-symbol fill">qr_code_2</span>
              </div>

              <div className="scan-cam-laser">
                <span className="scan-cam-laser-dot"></span>
              </div>
            </div>
          </div>

          <div className="scan-cam-distance">
            <span className="scan-cam-symbol" style={{ fontSize: '16px' }}>straighten</span>
            <span>المسافة المثالية: 15 - 30 سم</span>
          </div>
        </main>

        {/* الشريط السفلي */}
        <footer className="scan-cam-footer">
          <div className="scan-cam-sheet-handle"></div>

          <div className="scan-cam-summary">
            <div className="scan-cam-summary-info">
              <span className="scan-cam-summary-icon">
                <span className="scan-cam-symbol fill" style={{ fontSize: '18px' }}>check_circle</span>
              </span>
              <span className="scan-cam-summary-text">تم مسح التذاكر بنجاح</span>
            </div>

            <div className="scan-cam-count">
              <span className="scan-cam-count-num">{scanCount}</span>
              <span className="scan-cam-count-unit">طالب</span>
            </div>
          </div>

          <div className="scan-cam-actions">
            <button type="button" className="scan-cam-manual-btn" onClick={() => setIsModalOpen(true)}>
              <span className="scan-cam-symbol">keyboard</span>
              <span>إدخال يدوي لرقم التذكرة أو الرقم الجامعي</span>
            </button>

            <button
              type="button"
              className={`scan-cam-round-btn ${isTorchActive ? 'on' : 'primary'}`}
              aria-label="تشغيل الإضاءة"
              aria-pressed={isTorchActive}
              title="تشغيل الإضاءة"
              onClick={toggleTorch}
            >
              <span className="scan-cam-symbol">lightbulb</span>
            </button>

            <button
              type="button"
              className="scan-cam-round-btn soft"
              aria-label={isMuted ? 'تشغيل التنبيه الصوتي' : 'كتم التنبيه الصوتي'}
              title="تنبيه صوتي"
              onClick={toggleMute}
            >
              <span className="scan-cam-symbol">{isMuted ? 'volume_off' : 'volume_up'}</span>
            </button>
          </div>

          <p className="scan-cam-supervisor">بوابة رقم (A) — مشرف الفترة: م. حسام الأحمد</p>
        </footer>

        {/* نافذة الإدخال اليدوي */}
        {isModalOpen && (
          <div
            className="scan-cam-modal-backdrop"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <div className="scan-cam-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="scan-cam-modal-title">
              <div className="scan-cam-modal-head">
                <div className="scan-cam-modal-title-row">
                  <span className="scan-cam-symbol scan-cam-orange" style={{ fontSize: '24px' }}>dialpad</span>
                  <h3 id="scan-cam-modal-title">إدخال رقم الاعتماد المباشر</h3>
                </div>
                <button type="button" className="scan-cam-modal-close" aria-label="إغلاق" onClick={closeModal}>
                  <span className="scan-cam-symbol" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>

              <p className="scan-cam-modal-desc">
                أدخل الرقم الأكاديمي للخريج المطبوع أسفل الرمز الشريطي للتحقق الفوري.
              </p>

              <form onSubmit={handleManualSubmit} noValidate>
                <input
                  type="text"
                  dir="ltr"
                  autoFocus
                  autoComplete="off"
                  className={`scan-cam-input ${manualError ? 'error' : ''}`}
                  placeholder="مثال: ENG-44-8902"
                  value={manualCode}
                  aria-invalid={!!manualError}
                  onChange={(e) => {
                    setManualCode(e.target.value);
                    if (manualError) setManualError('');
                  }}
                />
                {manualError && (
                  <p className="scan-cam-error-text" role="alert">
                    {manualError}
                  </p>
                )}

                <div className="scan-cam-modal-buttons">
                  <button type="submit" className="scan-cam-btn-primary">
                    <span className="scan-cam-symbol" style={{ fontSize: '18px' }}>verified</span>
                    <span>تأكيد الحضور</span>
                  </button>
                  <button type="button" className="scan-cam-btn-soft" onClick={closeModal}>
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* إشعار قبول التذكرة */}
        <div className={`scan-cam-toast ${showToast ? 'show' : ''}`} role="status" aria-live="polite">
          <div className="scan-cam-toast-icon">
            <span className="scan-cam-symbol" style={{ fontSize: '22px' }}>check</span>
          </div>
          <div>
            <h4>تم قبول التذكرة بنجاح</h4>
            <p>م. عمر خالد السليمان — هندسة المعلوماتية</p>
          </div>
        </div>
      </div>
    </div>
  );
}