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

const STEPS = [
  'أدخل بياناتك الجامعية كما هي مسجلة في الجامعة.',
  'أنشئ حسابك وأكّد بريدك الإلكتروني بالرمز المرسل إليك.',
  'اختر الباقة المناسبة من باقات التذاكر المتاحة لحفلك (عدد المرافقين والسعر).',
  'حوّل المبلغ عبر شام كاش وأدخل بيانات التحويل.',
  'بعد تأكيد الاتحاد للدفع تظهر لك رموز QR ورقم مقعدك ورابط مجموعة الواتساب.',
];

const OWN_ONLY = [
  'لكل خريج حساب واحد وتذكرة واحدة.',
  'لا تسجّل لصديقك ببريدك، ولا تعطِ بياناتك لأحد.',
  'عند الدخول تُطابَق الهوية الشخصية لكل خريج، فلا يمكن الدخول بتذكرة شخص آخر.',
];

const PAYMENT_POINTS = [
  'اكتب رقمك الجامعي في خانة الملاحظة عند التحويل.',
  'أدخل رقم العملية والمبلغ واسم المرسل بدقة.',
];

const PAYMENT_STATUSES = [
  { label: 'بانتظار الدفع', tone: 'neutral' },
  { label: 'قيد المعالجة', tone: 'orange' },
  { label: 'مؤكدة', tone: 'green' },
];

const QR_POINTS = [
  'رمز لك ورمز لكل مرافق، وكل رمز يُستخدم مرة واحدة فقط.',
  'لا تنشر رموزك، وأعطِ كل مرافق رمزه.',
  'احتفظ بلقطة شاشة واشحن هاتفك يوم الحفل.',
];

const EVENT_DAY_POINTS = [
  'الخريج يدخل أولاً: رموز المرافقين لا تعمل قبل مسح رمز الخريج، فاحضروا معاً.',
  'لا يمكن إدخال مرافقين أكثر من العدد المحدد في تذكرتك.',
];

const SEAT_POINTS = [
  'بعد تأكيد الدفع يُحجز لك رقم مقعد واحد حسب ترتيب الصعود على المسرح.',
  'المرافقون يدخلون المدرج بدون أرقام مقاعد.',
  'رقم مقعدك يظهر بخط كبير في صفحة «تذكرتي».',
];

const FAQ = [
  {
    q: 'لم يصلني الرمز؟',
    a: 'تحقق من مجلد Spam، أو اطلب رمزاً جديداً بعد دقيقة، أو عدّل بريدك إن كان خاطئاً.',
  },
  {
    q: 'نسيت كلمة السر؟',
    a: 'اضغط «نسيت كلمة السر» في صفحة الدخول.',
  },
  {
    q: 'متى يغلق التسجيل؟',
    a: 'فترة التسجيل محدودة بأيام قليلة، فلا تؤجل.',
  },
];

const PHASES = {
  before: { subband: 'قبل التسجيل', title: 'قبل أن تبدأ التسجيل 🎓', sections: ['steps', 'own', 'faq'], faq: [0, 2] },
  registered: { subband: 'قبل الدفع', title: 'دليلك لاختيار التذكرة والدفع', sections: ['payment', 'faq'], faq: [0, 1] },
  paid: { subband: 'بعد الدفع', title: 'تذكرتك جاهزة: ماذا بعد؟', sections: ['qr', 'seat', 'eventday'], faq: [] },
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

  const renderSection = (key, number) => {
    switch (key) {
      case 'steps':
        return (
          <section className="guide-section" aria-label="خطوات الحصول على التذكرة" key={key}>
            <SectionHeader number={String(number)} icon="format_list_numbered" title="خطوات الحصول على التذكرة" />
            <ol className="guide-steps">
              {STEPS.map((text) => (
                <li key={text}>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </section>
        );
      case 'own':
        return (
          <section className="guide-section" aria-label="سجّل بنفسك فقط" key={key}>
            <SectionHeader number={String(number)} icon="badge" title="سجّل بنفسك فقط" />
            <BulletList items={OWN_ONLY} />
          </section>
        );
      case 'payment':
        return (
          <section className="guide-section" aria-label="الدفع" key={key}>
            <SectionHeader number={String(number)} icon="payments" title="الدفع" />
            <BulletList items={PAYMENT_POINTS} />

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

            <Warning tone="red">
              بعد تأكيد الدفع لا يمكن تعديل التذكرة أو إلغاؤها، ولا يُسترجع المبلغ.
            </Warning>
          </section>
        );
      case 'qr':
        return (
          <section className="guide-section" aria-label="رموز QR" key={key}>
            <SectionHeader number={String(number)} icon="qr_code_2" title="رموز QR" />
            <BulletList items={QR_POINTS} />
          </section>
        );
      case 'seat':
        return (
          <section className="guide-section" aria-label="مقعدك" key={key}>
            <SectionHeader number={String(number)} icon="event_seat" title="مقعدك" />
            <BulletList items={SEAT_POINTS} />
          </section>
        );
      case 'eventday':
        return (
          <section className="guide-section" aria-label="يوم الحفل" key={key}>
            <SectionHeader number={String(number)} icon="celebration" title="يوم الحفل" />
            <BulletList items={EVENT_DAY_POINTS} />
            <Warning>
              <strong>الهوية الشخصية إلزامية:</strong> تُستلم هويتك عند الدخول ويُسلَّم لك لباس التخرج، وتُعاد إليك
              الهوية بعد انتهاء الحفل وإرجاع اللباس. بدون هوية لن تتمكن من استلام لباس التخرج.
            </Warning>
          </section>
        );
      case 'faq':
        return (
          <section className="guide-section" aria-label="أسئلة سريعة" key={key}>
            <SectionHeader number={String(number)} icon="help" title="أسئلة سريعة" />
            <div className="guide-faq">
              {phaseConfig.faq.map((idx) => {
                const item = FAQ[idx];
                if (!item) return null;
                return (
                  <div className="guide-faq-item" key={item.q}>
                    <p className="guide-faq-q">{item.q}</p>
                    <p className="guide-faq-a">{item.a}</p>
                  </div>
                );
              })}
            </div>
          </section>
        );
      default:
        return null;
    }
  };

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
              <p className="card-subtitle">
                ألف مبروك التخرج! اقرأ هذه النقاط قبل المتابعة، فهي توفر عليك الكثير يوم الحفل.
              </p>
            </div>
          </section>

          {phaseConfig.sections.map((key, index) => renderSection(key, index + 1))}

          {/* الختام */}
          <section className="guide-closing">
            <span className="material-symbols-outlined">support_agent</span>
            <HelpFooter phone={contactPhone} />
            <p>نتمنى لك حفلاً لا يُنسى! 🎓</p>
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
