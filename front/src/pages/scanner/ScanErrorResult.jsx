import React, { useEffect } from 'react';
import '../../style/ScanErrorResult.css';
import unionLogo from '../../assets/only-logo.png';

/* ==========================================================================
   شاشة نتيجة المسح: رفض الدخول (.scan-err-*)
   errorType:
     'already_used'    → التذكرة مستخدمة مسبقاً
     'companion_error' → دخول المرافق قبل الخريج
   ========================================================================== */

export default function ScanErrorResult({
  errorType = 'already_used',
  ceremonyName = 'حفل كليات الهندسة — دفعة 2026',
  ticketData = {
    // مؤقت: يجي من الباك إند بعد المسح
    name: 'م. علاء الدين الأحمد',
    faculty: 'هندسة المعلوماتية',
    firstScanTime: '16:32:14',
    ticketId: '#UB-2024-8841',
    companionType: 'مرافق إضافي (1)',
  },
  onNextScan,
}) {
  useEffect(() => {
    // اهتزاز مزدوج للتنبيه الفوري على أجهزة الهاند هيلد
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  }, []);

  const handleNext = () => {
    if (onNextScan) onNextScan();
  };

  const isCompanionError = errorType === 'companion_error';

  return (
    <div className="scan-err-app-container">
      <div className="scan-err-mobile-frame">
        {/* الهيدر (نفس هيدر شاشة المسح) */}
        <header className="scan-err-header">
          <div className="scan-err-header-info">
            <img className="scan-err-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            <div>
              <h1 className="scan-err-header-title">ماسح التذاكر — جامعة حمص</h1>
              <p className="scan-err-header-sub">{ceremonyName}</p>
            </div>
          </div>
        </header>

        <main className="scan-err-content">
          {/* منطقة النتيجة الحمراء */}
          <section className="scan-err-hero" role="alert">
            <div className="scan-err-badge-wrapper">
              <div className="scan-err-pulse-halo"></div>
              <div className="scan-err-circle-icon">
                <span className="scan-err-symbol fill" style={{ fontSize: '48px' }}>
                  {isCompanionError ? 'group_off' : 'close'}
                </span>
              </div>
            </div>

            <span className="scan-err-hero-pill">
              <span className="scan-err-symbol" style={{ fontSize: '15px' }}>warning</span>
              <span>{isCompanionError ? 'تنبيه: المرافق قبل الخريج' : 'فشل التحقق الأمني'}</span>
            </span>
            <h2 className="scan-err-hero-title">{isCompanionError ? 'دخول غير مسموح' : 'دخول مرفوض'}</h2>
            <p className="scan-err-hero-sub">
              {isCompanionError ? 'ما فيك تدخل المرافق قبل الخريج' : 'هذا الرمز مستخدم من قبل'}
            </p>
          </section>

          {/* بطاقة تفاصيل الخطأ */}
          <section className="scan-err-card">
            <div className="scan-err-card-head">
              <span className="scan-err-reason-pill">
                <span className="scan-err-symbol fill" style={{ fontSize: '16px' }}>
                  {isCompanionError ? 'block' : 'error'}
                </span>
                <span>{isCompanionError ? 'يجب دخول الخريج أولاً' : 'تذكرة غير صالحة للاستخدام مجدداً'}</span>
              </span>
              <span className="scan-err-faculty-pill">{ticketData.faculty}</span>
            </div>

            {isCompanionError ? (
              <div className="scan-err-body">
                <p className="scan-err-text">
                  رمز التذكرة المعروض يخص <strong>({ticketData.companionType})</strong>. تنص تعليمات الحفل على دخول
                  الخريج الأساسي أولاً لتفعيل مقاعد المرافقين التابعين له.
                </p>
                <div className="scan-err-tip">
                  <div className="scan-err-tip-head">
                    <span>توجيه للمنظم:</span>
                    <span className="scan-err-tip-state">انتظار الخريج</span>
                  </div>
                  <p>يُرجى إعلام المرافق بانتظار وصول الخريج المسجل والتأكد من مسح باركود الخريج أولاً.</p>
                </div>
              </div>
            ) : (
              <div className="scan-err-body">
                <div className="scan-err-row">
                  <span className="scan-err-label">اسم الخريج:</span>
                  <span className="scan-err-value big">{ticketData.name}</span>
                </div>
                <div className="scan-err-row">
                  <span className="scan-err-label">
                    <span className="scan-err-symbol fill scan-err-orange">history</span>
                    أول عملية مسح:
                  </span>
                  <span className="scan-err-value danger" dir="ltr">{ticketData.firstScanTime}</span>
                </div>
                <div className="scan-err-row">
                  <span className="scan-err-label">
                    <span className="scan-err-symbol fill scan-err-muted">badge</span>
                    رقم التذكرة الأمني:
                  </span>
                  <span className="scan-err-value mono" dir="ltr">{ticketData.ticketId}</span>
                </div>
              </div>
            )}

            <div className="scan-err-alert-box">
              <span className="scan-err-symbol fill" style={{ fontSize: '20px' }}>report_problem</span>
              <p>
                {isCompanionError
                  ? 'يُرجى عدم السماح بدخول المرافق قبل دخول الخريج.'
                  : 'يرجى توجيه حامل التذكرة فوراً إلى مكتب الاستعلامات المركزي.'}
              </p>
            </div>
          </section>

          <div className="scan-err-logged">
            <span className="scan-err-logged-dot"></span>
            <span>تم تسجيل محاولة الدخول في السجل الأمني</span>
          </div>
        </main>

        {/* زر امسح التالي */}
        <footer className="scan-err-footer">
          <button type="button" className="scan-err-next-btn" onClick={handleNext}>
            <span>امسح التالي</span>
            <span className="scan-err-symbol" style={{ fontSize: '22px' }}>qr_code_scanner</span>
          </button>
        </footer>
      </div>
    </div>
  );
}