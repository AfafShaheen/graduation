import React, { useState } from 'react';
import { BEFORE_YOU_START_TEXT } from '../../config/fieldHints';
import { guideKeyOf, guideReading } from '../../config/guideKeys';
import { countLabel } from '../../utils/countLabel';
import '../../style/GraduationForm.css';
import '../../style/GraduateGuide.css';
import '../../style/BrandHeader.css';
import unionLogo from '../../assets/only-logo.png';
import useContactPhone from '../../hooks/useContactPhone';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import GraduateFooter from '../../components/GraduateFooter';
import UnionBrand from '../../components/UnionBrand';
import { NO_REFUND_TEXT } from '../../config/graduateTexts';

/* ==========================================================================
   دليل التذكرة: صفحة إرشادات بتظهر بعد تسجيل الدخول وقبل اختيار التذكرة
   عدّل النصوص من الثوابت تحت بدون ما تلمس الواجهة
   ========================================================================== */

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
        bullets: [BEFORE_YOU_START_TEXT],
      },
      {
        icon: 'format_list_numbered',
        title: 'خطوات التسجيل',
        steps: [
          'أدخل معلوماتك الجامعية.',
          'أنشئ حسابك (البريد الإلكتروني وكلمة السر).',
          'أكّد بريدك بالرمز المرسل إليك، ثم انتقل لاختيار التذكرة.',
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

// One point = one card: a key sentence that says what is asked, and under it the full text.
function GuideCardBody({ text }) {
  const key = guideKeyOf(text);
  return key ? (
    <span className="guide-card-body">
      <strong className="guide-card-key">{key}</strong>
      <span className="guide-card-text">{text}</span>
    </span>
  ) : (
    <span className="guide-card-body">
      <span className="guide-card-text">{text}</span>
    </span>
  );
}

function BulletList({ items }) {
  return (
    <ul className="guide-list guide-cards">
      {items.map((text) => (
        <li key={text} className="guide-card">
          <GuideCardBody text={text} />
        </li>
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
  phase: before | package
  mode:  required (first time: must tick "read and understood") | review (already read: just go back)
*/
export default function GraduateGuide({ phase = 'package', mode = 'required', onContinue, onBack, previous = [], supportPhone = '' }) {
  const cachedContactPhone = useContactPhone();
  const contactPhone = supportPhone || cachedContactPhone;

  const resolvedPhase = PHASES[phase] ? phase : 'package';
  const phaseConfig = PHASES[resolvedPhase];
  const reading = guideReading(phaseConfig);

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
        <ol className="guide-steps guide-cards">
          {section.steps.map((text) => (
            <li key={text} className="guide-card">
              <GuideCardBody text={text} />
            </li>
          ))}
        </ol>
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
          {phase === 'before' && <UnionBrand />}
          {/* مقدمة */}
          <section className="form-card guide-intro">
            <div>
              <h2 className="card-title">{phaseConfig.title}</h2>
              <p className="card-subtitle">{phaseConfig.subtitle}</p>
              <p className="guide-reading">
                {countLabel(reading.cards, 'نقطة', 'نقطتان', 'نقاط', 'نقطة', 'واحدة')} ·{' '}
                {reading.minutes === 1 ? 'قراءتها دقيقة واحدة' : `قراءتها ${reading.minutes} دقائق`}
              </p>
            </div>
          </section>

          {phaseConfig.sections.map((section, index) => renderSection(section, index + 1))}

          {phaseConfig.warning && (
            <div className="guide-warning-wrap">
              <Warning tone={phaseConfig.warning.tone}>{phaseConfig.warning.text}</Warning>
            </div>
          )}

          {mode === 'review' && previous.length > 0 && (
            <section className="guide-section" aria-label="إرشادات المراحل السابقة">
              <h2 className="guide-section-title">إرشادات المراحل السابقة</h2>
              <ul className="guide-previous">
                {previous.map((item) => (
                  <li key={item.key}>
                    <button type="button" className="guide-previous-btn" onClick={item.onOpen}>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* the same footer as every other page; the wish only closes the ticket guide */}
          {resolvedPhase === 'ticket' && <p className="guide-wish">نتمنى لك حفلاً لا يُنسى! 🎓</p>}
          <GraduateFooter phone={contactPhone} />
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