import React, { useState } from 'react';
import '../../style/GraduationForm.css';
import '../../style/GraduateGuide.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import useContactPhone from '../../hooks/useContactPhone';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';

/* ==========================================================================
   دليل التذكرة: صفحة إرشادات بتظهر بعد تسجيل الدخول وقبل اختيار التذكرة
   عدّل النصوص من الثوابت تحت بدون ما تلمس الواجهة
   ========================================================================== */

const STEPS = [
  'أدخل بياناتك الجامعية كما هي مسجلة في الجامعة.',
  'أنشئ حسابك وأكّد بريدك الإلكتروني بالرمز المرسل إليك.',
  'اختر نوع التذكرة: خريج + مرافقَين، أو خريج + 3 مرافقين.',
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
  onContinue({ dontShowAgain }): بعد ما الخريج يقرأ ويوافق ويضغط "فهمت، متابعة"
  supportPhone: رقم اتحاد الطلبة (اختياري)، إن مررته بيظهر بنهاية الصفحة
*/
export default function GraduateGuide({ onContinue, supportPhone = '' }) {
  const cachedContactPhone = useContactPhone();
  const contactPhone = supportPhone || cachedContactPhone;

  const [acknowledged, setAcknowledged] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleContinue = () => {
    if (!acknowledged) return;
    if (onContinue) onContinue({ dontShowAgain });
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
            <span className="subband-title">دليل التذكرة</span>
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
              <h2 className="card-title">دليلك لتذكرة حفل التخرج 🎓</h2>
              <p className="card-subtitle">
                ألف مبروك التخرج! اقرأ هذه النقاط قبل المتابعة، فهي توفر عليك الكثير يوم الحفل.
              </p>
            </div>
          </section>

          {/* ① خطوات الحصول على التذكرة */}
          <section className="guide-section" aria-label="خطوات الحصول على التذكرة">
            <SectionHeader number="1" icon="format_list_numbered" title="خطوات الحصول على التذكرة" />
            <ol className="guide-steps">
              {STEPS.map((text) => (
                <li key={text}>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* ② سجّل بنفسك فقط */}
          <section className="guide-section" aria-label="سجّل بنفسك فقط">
            <SectionHeader number="2" icon="badge" title="سجّل بنفسك فقط" />
            <BulletList items={OWN_ONLY} />
          </section>

          {/* ③ الدفع */}
          <section className="guide-section" aria-label="الدفع">
            <SectionHeader number="3" icon="payments" title="الدفع" />
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

          {/* ④ رموز QR */}
          <section className="guide-section" aria-label="رموز QR">
            <SectionHeader number="4" icon="qr_code_2" title="رموز QR" />
            <BulletList items={QR_POINTS} />
          </section>

          {/* ⑤ يوم الحفل */}
          <section className="guide-section" aria-label="يوم الحفل">
            <SectionHeader number="5" icon="celebration" title="يوم الحفل" />
            <BulletList items={EVENT_DAY_POINTS} />
            <Warning>
              <strong>الهوية الشخصية إلزامية:</strong> تُستلم هويتك عند الدخول ويُسلَّم لك لباس التخرج، وتُعاد إليك
              الهوية بعد انتهاء الحفل وإرجاع اللباس. بدون هوية لن تتمكن من استلام لباس التخرج.
            </Warning>
          </section>

          {/* ⑥ أسئلة سريعة */}
          <section className="guide-section" aria-label="أسئلة سريعة">
            <SectionHeader number="6" icon="help" title="أسئلة سريعة" />
            <div className="guide-faq">
              {FAQ.map((item) => (
                <div className="guide-faq-item" key={item.q}>
                  <p className="guide-faq-q">{item.q}</p>
                  <p className="guide-faq-a">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* الختام */}
          <section className="guide-closing">
            <span className="material-symbols-outlined">support_agent</span>
            <p>
              لأي استفسار تواصل مع اتحاد الطلبة.
              {contactPhone ? (
                <>
                  <br />
                  للطوارئ والاستفسار:{' '}
                  <a
                    href={`tel:${contactPhone.replace(/\s+/g, '')}`}
                    dir="ltr"
                    style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 700 }}
                  >
                    {contactPhone}
                  </a>
                </>
              ) : null}
              <br />
              نتمنى لك حفلاً لا يُنسى! 🎓
            </p>
          </section>
        </div>

        {/* الشريط السفلي: الموافقة والمتابعة */}
        <div className="footer-deck guide-dock">
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

          <button className="submit-btn" type="button" disabled={!acknowledged} onClick={handleContinue}>
            <span>فهمت، متابعة لاختيار التذكرة</span>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        </div>
      </main>
    </div>
  );
}