import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../style/ScanErrorResult.css';
import unionLogo from '../../assets/only-logo.png';
import { getScannerEvent } from '../../api/session';

const META = {
  already_used: {
    icon: "close",
    pill: "فشل التحقق الأمني",
    title: "دخول مرفوض",
    subtitle: "هذا الرمز مستخدم من قبل",
    reason: "تذكرة غير صالحة للاستخدام مجدداً",
    alert: "يرجى توجيه حامل التذكرة فوراً إلى مكتب الاستعلامات المركزي.",
  },
  companion_error: {
    icon: "group_off",
    pill: "تنبيه: المرافق قبل الخريج",
    title: "دخول غير مسموح",
    subtitle: "ما فيك تدخل المرافق قبل الخريج",
    reason: "يجب دخول الخريج أولاً",
    alert: "يُرجى عدم السماح بدخول المرافق قبل دخول الخريج.",
  },
  not_activated: {
    icon: "schedule",
    pill: "تذكرة غير مفعّلة",
    title: "دخول مرفوض",
    subtitle: "التذكرة لم تُفعّل بعد",
    reason: "بانتظار التفعيل",
    alert: "يُرجى المحاولة لاحقاً أو مراجعة المنظم.",
  },
  not_found: {
    icon: "help",
    pill: "رمز غير معروف",
    title: "دخول مرفوض",
    subtitle: "التذكرة غير موجودة في النظام",
    reason: "رمز غير مسجّل",
    alert: "تأكد من أن الرمز تابع لمنظومة تذاكر هذا الحفل.",
  },
  ticket_not_confirmed: {
    icon: "pending",
    pill: "تذكرة غير مؤكدة",
    title: "دخول مرفوض",
    subtitle: "الطلب لم يُؤكّد بعد",
    reason: "التذكرة غير مؤكدة",
    alert: "يُرجى مراجعة حالة الطلب مع الإدارة.",
  },
};

export default function ScanErrorResult({
  onNextScan,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  }, []);

  const state = location.state ?? {};
  const errorType = state.errorType || state.result?.decision?.toLowerCase() || 'already_used';
  const ceremonyName = getScannerEvent()?.name ?? state.event?.name ?? 'حفل التخرج';
  const resultMessage = state.result?.message;

  const meta = META[errorType] || META[errorType.toLowerCase()] || META.already_used;
  const isCompanionError = errorType === 'companion_error' || errorType === 'not_activated';

  const handleNext = () => {
    if (onNextScan) {
      onNextScan();
    } else {
      navigate('/scanner/scan');
    }
  };

  return (
    <div className="scan-err-app-container">
      <div className="scan-err-mobile-frame">
        {/* الهيدر */}
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
                  {meta.icon}
                </span>
              </div>
            </div>

            <span className="scan-err-hero-pill">
              <span className="scan-err-symbol" style={{ fontSize: '15px' }}>warning</span>
              <span>{meta.pill}</span>
            </span>
            <h2 className="scan-err-hero-title">{meta.title}</h2>
            <p className="scan-err-hero-sub">
              {resultMessage || meta.subtitle}
            </p>
          </section>

          {/* بطاقة تفاصيل الخطأ */}
          <section className="scan-err-card">
            <div className="scan-err-card-head">
              <span className="scan-err-reason-pill">
                <span className="scan-err-symbol fill" style={{ fontSize: '16px' }}>
                  {isCompanionError ? 'block' : 'error'}
                </span>
                <span>{meta.reason}</span>
              </span>
              {/* D13: backend does not return personal data */}
              <span className="scan-err-faculty-pill">—</span>
            </div>

            {isCompanionError ? (
              <div className="scan-err-body">
                <p className="scan-err-text">
                  رمز التذكرة المعروض يخص مرافقاً. تنص تعليمات الحفل على دخول
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
                  {/* D13: backend does not return personal data */}
                  <span className="scan-err-value big">—</span>
                </div>
                <div className="scan-err-row">
                  <span className="scan-err-label">
                    <span className="scan-err-symbol fill scan-err-orange">history</span>
                    أول عملية مسح:
                  </span>
                  {/* D13: backend does not return personal data */}
                  <span className="scan-err-value danger" dir="ltr">—</span>
                </div>
                <div className="scan-err-row">
                  <span className="scan-err-label">
                    <span className="scan-err-symbol fill scan-err-muted">badge</span>
                    رقم التذكرة الأمني:
                  </span>
                  {/* D13: backend does not return personal data */}
                  <span className="scan-err-value mono" dir="ltr">—</span>
                </div>
              </div>
            )}

            <div className="scan-err-alert-box">
              <span className="scan-err-symbol fill" style={{ fontSize: '20px' }}>report_problem</span>
              <p>{meta.alert}</p>
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
