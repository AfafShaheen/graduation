import React, { useState } from 'react';
import '../../style/GraduationForm.css';
import '../../style/GraduateGuide.css';
import '../../style/BrandHeader.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import useContactPhone from '../../hooks/useContactPhone';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import HelpFooter from '../../components/HelpFooter';

/* ==========================================================================
   دليل التذكرة: صفحة إرشادات بتظهر بعد تسجيل الدخول وقبل اختيار التذكرة
   عدّل النصوص من الثوابت تحت بدون ما تلمس الواجهة
   ========================================================================== */

const PAYMENT_STATUSES = [
  { label: 'بانتظار الدفع', tone: 'neutral' },
  { label: 'قيد المعالجة', tone: 'orange' },
  { label: 'مؤكدة', tone: 'green' },
];

/* كل مرحلة = صفحة كاملة. لا يوجد قسم أسئلة شائعة. */
const PHASES = {
  before: {
    subband: 'إرشادات التسجيل',
    title: 'قبل أن تبدأ التسجيل 🎓',
    subtitle: 'ألف مبروك التخرج! اقرأ هذه النقاط قبل تعبئة بياناتك.',
    sections: [
      {
        icon: 'how_to_reg',
        title: 'من يحق له التسجيل؟',
        bullets: [
          'الخريجون المسجّلون في سجلات الجامعة لهذا الفوج فقط.',
          'يجب أن تكون كليتك مشمولة بالحفل وأن تكون فترة التسجيل مفتوحة.',
        ],
      },
      {
        icon: 'checklist',
        title: 'جهّز قبل البدء',
        bullets: [
          'اسمك وكنيتك واسم الأب واسم الأم كما هي في سجلات الجامعة.',
          'رقمك الجامعي ومعدلك.',
          'بريد إلكتروني تستخدمه فعلاً، لأن رمز التحقق سيصلك عليه.',
          'رقم هاتف للتواصل.',
        ],
      },
      {
        icon: 'format_list_numbered',
        title: 'خطوات التسجيل',
        steps: [
          'أدخل معلوماتك الجامعية.',
          'أنشئ حسابك (البريد الإلكتروني وكلمة السر).',
          'أكّد بريدك بالرمز المرسل إليك.',
          'أجب عن سؤالين قصيرين، ثم انتقل لاختيار التذكرة.',
        ],
      },
      {
        icon: 'badge',
        title: 'سجّل بنفسك فقط',
        bullets: [
          'لكل خريج حساب واحد وتذكرة واحدة.',
          'لا تسجّل لصديقك ببريدك، ولا تعطِ بياناتك لأحد.',
          'عند الدخول تُطابَق الهوية الشخصية لكل خريج.',
        ],
      },
      {
        icon: 'priority_high',
        title: 'ملاحظات مهمة',
        bullets: [
          'إذا لم يصلك رمز التحقق، تحقّق من مجلد الرسائل غير المرغوب فيها (Spam).',
          'فترة التسجيل محدودة، فلا تؤجّل.',
        ],
      },
    ],
  },

  registered: {
    subband: 'اختيار التذكرة والدفع',
    title: 'دليلك لاختيار التذكرة والدفع',
    subtitle: 'تم إنشاء حسابك بنجاح. هذه خطواتك التالية.',
    sections: [
      {
        icon: 'confirmation_number',
        title: 'اختيار الباقة',
        bullets: [
          'اختر باقة واحدة حسب عدد المرافقين، ولكل باقة سعرها.',
          'يمكنك تغيير الباقة طالما لم ترسل بيانات الدفع بعد.',
        ],
      },
      {
        icon: 'payments',
        title: 'الدفع عبر شام كاش',
        bullets: [
          'امسح رمز QR أو انسخ رقم حساب شام كاش من صفحة الدفع.',
          'اكتب رقمك الجامعي في خانة الملاحظة عند التحويل.',
          'أدخل رقم العملية والمبلغ واسم المرسل كما تظهر في إشعار التحويل.',
        ],
      },
      { icon: 'pending_actions', title: 'حالة طلبك', statuses: true },
    ],
    warning: { tone: 'red', text: 'بعد تأكيد الدفع لا يمكن تعديل التذكرة أو إلغاؤها، ولا يُسترجع المبلغ.' },
  },

  paid: {
    subband: 'يوم الحفل',
    title: 'تذكرتك جاهزة: ماذا بعد؟',
    subtitle: 'تم تأكيد دفعك. احتفظ بهذه الإرشادات ليوم الحفل.',
    sections: [
      {
        icon: 'qr_code_2',
        title: 'رموز QR',
        bullets: [
          'رمز لك ورمز لكل مرافق، وكل رمز يُستخدم مرة واحدة فقط.',
          'لا تنشر رموزك، وأعطِ كل مرافق رمزه.',
          'احتفظ بلقطة شاشة واشحن هاتفك يوم الحفل.',
        ],
      },
      {
        icon: 'event_seat',
        title: 'رقم مقعدك',
        bullets: [
          'رقم المقعد للخريج فقط، ويحدّد ترتيبك عند الصعود إلى المسرح.',
          'احفظ رقمك واجلس في مقعدك المحدّد.',
          'يجلس المرافقون في الصالة المخصّصة لهم دون أرقام مقاعد.',
        ],
      },
      {
        icon: 'celebration',
        title: 'يوم الحفل',
        bullets: [
          'الخريج يدخل أولاً: رموز المرافقين لا تعمل قبل مسح رمز الخريج، فاحضروا معاً.',
          'لا يمكن إدخال مرافقين أكثر من العدد المحدّد في تذكرتك.',
        ],
      },
    ],
    warning: {
      tone: 'orange',
      text: 'الهوية الشخصية إلزامية: تُستلم هويتك عند الدخول ويُسلَّم لك لباس التخرج، وتُعاد إليك بعد انتهاء الحفل وإرجاع اللباس.',
    },
  },
};

function SectionHeader({ number, icon, title }) {
  return (
    <div className="guide-section-head">
      <span className="guide-number" aria-hidden="true">{number}</span>
      <h2 className="guide-section-title">{title}</h2>
      <span className="material-symbols-outlined guide-section-icon" aria-hidden="true">{icon}</span>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="guide-list">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

function Warning({ children, tone = 'orange' }) {
  return (
    <div className={`guide-warning ${tone}`} role="note">
      <span className="material-symbols-outlined">warning</span>
      <p>{children}</p>
    </div>
  );
}

export default function GraduateGuide({ phase = 'registered', onContinue, onBack, supportPhone = '' }) {
  const cachedContactPhone = useContactPhone();
  const contactPhone = supportPhone || cachedContactPhone;

  const resolvedPhase = PHASES[phase] ? phase : 'registered';
  const phaseConfig = PHASES[resolvedPhase];

  const [acknowledged, setAcknowledged] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleContinue = () => {
    if (!acknowledged) return;
    if (onContinue) onContinue({ dontShowAgain });
  };

  const renderSection = (section, number) => (
    <section className="guide-section" aria-label={section.title} key={section.title}>
      <SectionHeader number={String(number)} icon={section.icon} title={section.title} />

      {section.bullets && <BulletList items={section.bullets} />}

      {section.steps && (
        <ol className="guide-steps">
          {section.steps.map((text) => (
            <li key={text}>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      )}

      {section.statuses && (
        <div className="guide-status-block">
          <span className="guide-status-label">حالات التذكرة:</span>
          <div className="guide-status-flow">
            {PAYMENT_STATUSES.map((status, i) => (
              <React.Fragment key={status.label}>
                {i > 0 && (
                  <span className="material-symbols-outlined guide-status-arrow" aria-hidden="true">
                    arrow_back
                  </span>
                )}
                <span className={`guide-status-chip ${status.tone}`}>{status.label}</span>
              </React.Fragment>
            ))}
          </div>
          <p className="guide-status-note">
            أو <strong>مرفوضة</strong> مع ذكر السبب، ويمكنك إعادة الإرسال.
          </p>
        </div>
      )}
    </section>
  );

  return (
    <div className="app-container">
      <main className="mobile-shell">
        {/* الهيدر العلوي (نفس بقية الصفحات، بلا سهم رجوع) */}
        <header className="header-main">
          <div className="header-top">
            <div className="icon-btn" aria-hidden="true"></div>
            <h1 className="header-title">{CEREMONY_TITLE}</h1>
            <div className="icon-btn">
              <img className="header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>
          <div className="header-subband">
            <span className="subband-title">{phaseConfig.subband}</span>
            <span className="badge-batch">{BATCH_BADGE}</span>
          </div>
        </header>

        <div className="guide-body">
          {/* مقدمة */}
          <section className="form-card guide-intro">
            <div className="logo-circle">
              <img src={universityLogo} alt="شعار جامعة حمص" />
            </div>
            <div>
              <h2 className="card-title">{phaseConfig.title}</h2>
              <p className="card-subtitle">{phaseConfig.subtitle}</p>
            </div>
          </section>

          {phaseConfig.sections.map((section, index) => renderSection(section, index + 1))}

          {phaseConfig.warning && (
            <div className="guide-warning-wrap">
              <Warning tone={phaseConfig.warning.tone}>{phaseConfig.warning.text}</Warning>
            </div>
          )}

          {/* الختام */}
          <section className="guide-closing">
            <div className="guide-closing-help">
              <span className="material-symbols-outlined" aria-hidden="true">support_agent</span>
              <HelpFooter phone={contactPhone} />
            </div>
            <p className="guide-closing-wish">نتمنى لك حفلاً لا يُنسى! 🎓</p>
          </section>
        </div>

        {/* الشريط السفلي: الموافقة والمتابعة */}
        <div className="footer-deck guide-dock">
          {resolvedPhase === 'registered' && (
            <>
              <label className="guide-check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>
                  قرأت الإرشادات وفهمتها <span className="required-star">*</span>
                </span>
              </label>

              <label className="guide-check muted">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                <span>لا تعرض لي هذه الصفحة عند تسجيل الدخول مرة أخرى</span>
              </label>
            </>
          )}

          {resolvedPhase === 'before' && (
            <button className="submit-btn" type="button" onClick={() => onContinue && onContinue()}>
              <span>ابدأ التسجيل</span>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}

          {resolvedPhase === 'registered' && (
            <button className="submit-btn" type="button" disabled={!acknowledged} onClick={handleContinue}>
              <span>فهمت، متابعة لاختيار التذكرة</span>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}

          {resolvedPhase === 'paid' && (
            <button className="submit-btn" type="button" onClick={() => onBack && onBack()}>
              <span>العودة إلى تذكرتي</span>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
