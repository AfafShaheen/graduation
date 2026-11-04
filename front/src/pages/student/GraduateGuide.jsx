import React, { useState } from 'react';
import '../../style/GraduationForm.css';
import '../../style/GraduateGuide.css';
import '../../style/BrandHeader.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import useContactPhone from '../../hooks/useContactPhone';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import HelpFooter from '../../components/HelpFooter';
import {
  ID_PROOF_TEXT,
  NO_REFUND_TEXT,
  PAYMENT_NOTE_TEXT,
  QR_REQUIRED_TEXT,
  GROUP_TEXT,
} from '../../config/graduateTexts';

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
          'رقم واتساب للتواصل.',
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
        ],
      },
      {
        icon: 'priority_high',
        title: 'ملاحظة مهمة',
        bullets: ['فترة التسجيل محدودة، فلا تؤجّل.'],
      },
    ],
  },

  package: {
    subband: 'اختيار الباقة',
    title: 'اختيار الباقة',
    subtitle: 'تم إنشاء حسابك بنجاح. الخطوة التالية اختيار الباقة.',
    sections: [
      {
        icon: 'confirmation_number',
        title: 'كيف تختار؟',
        bullets: [
          'اختر باقة واحدة حسب عدد المرافقين، ولكل باقة سعرها.',
          'يحصل كل شخص (أنت ومرافقوك) على رمز QR خاص به.',
          'يمكنك تغيير الباقة طالما لم ترسل بيانات الدفع بعد.',
        ],
      },
    ],
    warning: { tone: 'red', text: NO_REFUND_TEXT },
  },

  payment: {
    subband: 'الدفع عبر شام كاش',
    title: 'الدفع عبر شام كاش',
    subtitle: 'حوّل المبلغ ثم أدخل بيانات التحويل.',
    sections: [
      {
        icon: 'payments',
        title: 'خطوات الدفع',
        steps: [
          'امسح رمز QR أو انسخ رقم حساب شام كاش من صفحة الدفع.',
          'اكتب المبلغ المطلوب كما يظهر في الصفحة.',
          PAYMENT_NOTE_TEXT,
          'عُد إلى الصفحة وأدخل: رقم العملية، والمبلغ المحوّل، واسم المرسل كما يظهر في إشعار التحويل.',
        ],
      },
    ],
    warning: { tone: 'orange', text: 'راجع المبلغ والملاحظة قبل التحويل، فالتحويل الخاطئ يؤخر تأكيد تذكرتك.' },
  },

  submitted: {
    subband: 'حالة الطلب',
    title: 'تم استلام دفعتك',
    subtitle: 'هذا ما سيحدث الآن.',
    sections: [
      {
        icon: 'pending_actions',
        title: 'ماذا يحدث الآن؟',
        bullets: [
          'يراجع الاتحاد دفعتك ويطابقها مع إشعار شام كاش.',
          'تستغرق المراجعة عادةً من ساعتين إلى 24 ساعة.',
          'لن يصلك إشعار تلقائي: عُد إلى الموقع وتحقّق بنفسك. عندما تصبح الحالة «مؤكدة» يظهر رمز QR.',
        ],
        statuses: true,
      },
      {
        icon: 'priority_high',
        title: 'إن حدث تأخير أو رفض',
        bullets: [
          'إن رُفض الدفع يظهر لك السبب، ويمكنك إعادة الإرسال ما دام التسجيل مفتوحاً.',
          'إن تأخّر طلبك أكثر من 24 ساعة، تواصل معنا على الواتساب (الرقم في أسفل الصفحة).',
        ],
      },
    ],
    warning: { tone: 'red', text: QR_REQUIRED_TEXT },
  },

  ticket: {
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
        icon: 'celebration',
        title: 'يوم الحفل',
        bullets: [
          'الخريج يدخل أولاً: رموز المرافقين لا تعمل قبل مسح رمز الخريج، فاحضروا معاً.',
          'لا يمكن إدخال مرافقين أكثر من العدد المحدّد في تذكرتك.',
        ],
      },
      {
        icon: 'forum',
        title: 'مجموعة الحفل',
        bullets: [GROUP_TEXT],
      },
    ],
    warning: { tone: 'orange', text: `إثبات الشخصية إلزامي: ${ID_PROOF_TEXT}` },
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

/*
  phase: before | package | payment | submitted | ticket
  mode:  required (first time: must tick "read and understood") | review (already read: just go back)
*/
export default function GraduateGuide({ phase = 'package', mode = 'required', onContinue, onBack, supportPhone = '' }) {
  const cachedContactPhone = useContactPhone();
  const contactPhone = supportPhone || cachedContactPhone;

  const resolvedPhase = PHASES[phase] ? phase : 'package';
  const phaseConfig = PHASES[resolvedPhase];

  const [acknowledged, setAcknowledged] = useState(false);

  const handleContinue = () => {
    if (!acknowledged) return;
    if (onContinue) onContinue();
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
              <HelpFooter phone={contactPhone} />
            </div>

            <p className="guide-closing-wish">نتمنى لك حفلاً لا يُنسى! 🎓</p>
          </section>
        </div>

        {/* الشريط السفلي: الموافقة والمتابعة */}
        <div className="footer-deck guide-dock">
          {resolvedPhase === 'before' && (
            <button className="submit-btn" type="button" onClick={() => onContinue && onContinue()}>
              <span>ابدأ التسجيل</span>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}

          {resolvedPhase !== 'before' && mode === 'required' && (
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
              <button className="submit-btn" type="button" disabled={!acknowledged} onClick={handleContinue}>
                <span>فهمت، متابعة</span>
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              {!acknowledged && <p className="guide-dock-hint">أكّد القراءة لتتابع.</p>}
            </>
          )}

          {resolvedPhase !== 'before' && mode === 'review' && (
            <button className="submit-btn" type="button" onClick={() => onBack && onBack()}>
              <span>رجوع</span>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}