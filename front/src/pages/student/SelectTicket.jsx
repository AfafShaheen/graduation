import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../style/SelectTicket.css';
import '../../style/BrandHeader.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import { getTicketOptions, selectTicket } from '../../api/graduate';
import { getGraduateToken } from '../../api/session';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import HelpFooter from '../../components/HelpFooter';

/* صيغة العدد بالعربي: 1 مرافق، 2 مرافقان، 3-10 مرافقين، 11+ مرافقاً */
const companionsText = (n) => {
  if (n === 1) return 'مرافق واحد';
  if (n === 2) return 'مرافقان';
  if (n >= 3 && n <= 10) return `${n.toLocaleString('ar-SY')} مرافقين`;
  return `${n.toLocaleString('ar-SY')} مرافقاً`;
};

/* الباك يرجّع باقات الحفل: [{ companions_count, price }].
   عدد المرافقين فريد ضمن الحفل، فنستخدمه كمعرّف للبطاقة وكقيمة الإرسال. */
const buildOption = (o, index, all) => {
  const n = Number(o.companions_count);
  const isLargest = all.length > 1 && n === Math.max(...all.map((x) => Number(x.companions_count)));
  return {
    id: n,
    title: `خريج + ${companionsText(n)}`,
    guestsCount: n,
    price: o.price,
    features: [
      { icon: 'chair', text: 'مقعد مخصص للخريج في المنصة الرئيسية' },
      { icon: n > 2 ? 'groups' : 'group', text: `${companionsText(n)} في الصالة الشرفية` },
    ],
    badge:
      index === 0
        ? { className: 'st-badge-popular', dot: true, text: 'الأكثر اختياراً' }
        : isLargest
          ? { className: 'st-badge-family', icon: 'family_restroom', text: 'باقة العائلة الموسعة' }
          : null,
  };
};

const formatPrice = (value) => Number(value).toLocaleString('ar-SY');

export default function SelectTicket({ onBack }) {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedType, setSelectedType] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const options = (data?.options || []).map(buildOption);
  const registrationOpen = !!data?.registration?.is_open;

  const load = useCallback(async () => {
    const accessValue = getGraduateToken();
    if (!accessValue) {
      navigate('/login', { replace: true });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getTicketOptions(accessValue);
      setData(result);
      setSelectedType((prev) => {
        const counts = (result.options || []).map((o) => Number(o.companions_count));
        if (prev != null && counts.includes(prev)) return prev;
        return counts.length ? counts[0] : null;
      });
    } catch (err) {
      setError(err?.message || 'تعذّر تحميل باقات التذاكر، حاول لاحقاً.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleContinue = async () => {
    if (!registrationOpen || selectedType == null) return;
    const accessValue = getGraduateToken();
    if (!accessValue) {
      navigate('/login');
      return;
    }
    setSubmitting(true);
    setActionError('');
    try {
      await selectTicket({ companions_count: selectedType, confirm: true }, accessValue);
      navigate('/payment');
    } catch (err) {
      if (err?.status === 409) {
        setActionError(err?.message || 'تعذّر تأكيد الاختيار.');
        await load();
      } else {
        setActionError(err?.message || 'تعذّر تأكيد الاختيار، حاول لاحقاً.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (registrationOpen) setSelectedType(id);
    }
  };

  return (
    <div className="st-app-container">
      <div className="st-mobile-shell">
        <header className="st-header-main">
          <div className="st-header-top">
            <button
              aria-label="الرجوع"
              className="st-icon-btn"
              type="button"
              onClick={() => (onBack ? onBack() : window.history.back())}
            >
              <span className="st-symbol" style={{ fontSize: '22px' }}>
                arrow_forward
              </span>
            </button>

            <h1 className="st-header-title">{CEREMONY_TITLE}</h1>

            <div className="st-icon-btn static">
              <img className="st-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="st-header-subband">
            <span className="st-subband-title">اختيار التذكرة</span>
            <span className="st-badge-batch">{BATCH_BADGE}</span>
          </div>
        </header>

        <main className="st-main-stage">
          <section className="st-hero-card">
            <div className="st-hero-content">
              <div className="st-hero-tag">
                <span className="st-dot"></span>
                <span className="st-tag-text">
                  {data?.event?.name || CEREMONY_TITLE}
                </span>
              </div>
              <h2 className="st-hero-headline">حدّد باقة الحضور المناسبة لك ولعائلتك</h2>
              <p className="st-hero-subtext">خطوة واحدة وتصبح تذكرتك الرسمية جاهزة</p>
            </div>
            <div className="st-hero-logo-box">
              <img alt="شعار جامعة حمص" className="st-hero-logo-img" src={universityLogo} />
            </div>
          </section>

          {!loading && !error && !registrationOpen && (
            <section className="st-notice-card" aria-live="polite">
              <div className="st-notice-icon-bg">
                <span className="st-symbol" style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  event_busy
                </span>
              </div>
              <div>
                <h4 className="st-notice-headline">التسجيل مغلق</h4>
                <p className="st-notice-body">
                  لم يعد التسجيل متاحاً لهذه الدفعة. يرجى متابعة الإعلانات الرسمية.
                </p>
              </div>
            </section>
          )}

          {loading && <p className="st-hero-subtext">جارٍ تحميل الباقات...</p>}

          {error && !loading && (
            <section className="st-notice-card" role="alert">
              <div>
                <p className="st-notice-body">{error}</p>
              </div>
            </section>
          )}

          {!loading && !error && (
            <section className="st-options-list" aria-label="باقات التذاكر" role="radiogroup">
              {options.map((option) => (
                <div
                  key={option.id}
                  className={`st-ticket-option ${selectedType === option.id ? 'st-selected' : ''}`}
                  onClick={() => registrationOpen && setSelectedType(option.id)}
                  onKeyDown={(e) => handleKeyDown(e, option.id)}
                  role="radio"
                  aria-checked={selectedType === option.id}
                  aria-disabled={!registrationOpen}
                  tabIndex={registrationOpen ? 0 : -1}
                >
                  <div className="st-option-top">
                    <div className="st-option-info">
                      <div className="st-option-icon-wrapper">
                        <span className="st-symbol">confirmation_number</span>
                      </div>
                      <div>
                        <h3 className="st-option-title">{option.title}</h3>
                        <div className="st-price-row">
                          <span className="st-price-label">السعر:</span>
                          <span className="st-price-val">{formatPrice(option.price)}</span>
                          <span className="st-price-currency">ل.س</span>
                        </div>
                      </div>
                    </div>
                    <div className="st-radio-circle">
                      <span className="st-symbol" style={{ fontSize: '16px', fontWeight: 'bold' }}>
                        check
                      </span>
                    </div>
                  </div>

                  <ul className="st-features-list">
                    {option.features.map((f) => (
                      <li className="st-feature-item" key={f.text}>
                        <span className="st-symbol st-feature-icon">{f.icon}</span>
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  {option.badge && (
                  <div className="st-option-footer">
                    <span className={option.badge.className}>
                      {option.badge.dot && (
                        <span className="st-dot" style={{ width: '6px', height: '6px' }}></span>
                      )}
                      {option.badge.icon && (
                        <span className="st-symbol" style={{ fontSize: '14px' }}>
                          {option.badge.icon}
                        </span>
                      )}
                      {option.badge.text}
                    </span>
                  </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {data?.info_text && (
            <section className="st-notice-card">
              <div className="st-notice-icon-bg">
                <span className="st-symbol" style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  info
                </span>
              </div>
              <div>
                <h4 className="st-notice-headline">تنبيه هام</h4>
                <p className="st-notice-body">{data.info_text}</p>
              </div>
            </section>
          )}

          {actionError && (
            <section className="st-notice-card" role="alert">
              <div>
                <p className="st-notice-body">{actionError}</p>
              </div>
            </section>
          )}
        </main>

        <div className="st-bottom-dock">
          <HelpFooter />
          <button
            className="st-action-btn"
            type="button"
            onClick={handleContinue}
            disabled={!registrationOpen || selectedType == null || submitting}
          >
            <span>{submitting ? 'جارٍ التأكيد...' : 'تأكيد الاختيار ومتابعة الدفع'}</span>
            <span className="st-symbol" style={{ fontSize: '20px' }}>
              arrow_back
            </span>
          </button>
          <div className="st-dock-caption">
            الدفع عبر شام كاش بتحويل مباشر، وتُؤكَّد تذكرتك بعد التحقق من الإيصال
          </div>
        </div>
      </div>
    </div>
  );
}
