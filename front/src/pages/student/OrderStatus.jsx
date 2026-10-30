import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../../style/OrderStatus.css';
import '../../style/BrandHeader.css';
import universityLogo from '../../assets/homs-university-white.png';
import unionLogo from '../../assets/only-logo.png';
import useMyTicket from '../../hooks/useMyTicket';
import { companionsLabel } from '../../utils/companions';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import HelpFooter from '../../components/HelpFooter';
import { routeForTicket, ORDER_POLL_MS } from '../../utils/ticketRoute';

/* تنسيق التاريخ والوقت بالعربية مع أرقام إنجليزية */
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export default function OrderStatus() {
  const { data, loading, error, reload, refresh } = useMyTicket();
  const navigate = useNavigate();
  const ticket = data?.ticket;
  const event = data?.event;

  // تحديث تلقائي بصمت كل 15 ثانية أثناء ظهور الصفحة، وفوراً عند العودة للتبويب
  // أو رجوع الاتصال، حتى يظهر قبول الأدمن أو رفضه بدون ما يضغط الخريج شي.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(tick, ORDER_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
    };
  }, [refresh]);

  // لما تتغير حالة الطلب (قُبل أو رُفض) ننقل الخريج تلقائياً للصفحة المناسبة
  useEffect(() => {
    if (!data) return;
    const target = routeForTicket(data);
    if (target !== '/payment-submitted') navigate(target, { replace: true });
  }, [data, navigate]);

  const amountText = ticket?.price != null
    ? `${Number(ticket.price).toLocaleString('en-US')} ل.س`
    : '—';

  return (
    <div className="os-app-container">
      <main className="os-mobile-shell">
        <header className="os-header-main">
          <div className="os-header-top">
            <div className="os-icon-btn static" aria-hidden="true"></div>

            <h1 className="os-header-title">{CEREMONY_TITLE}</h1>

            <div className="os-icon-btn static">
              <img className="os-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="os-header-subband">
            <span className="os-subband-title">حالة الطلب</span>
            <span className="os-badge-batch">{BATCH_BADGE}</span>
          </div>
        </header>

        <div className="os-main-stage">
          {loading && !data && <p className="os-card-subtext">جارٍ تحميل حالة الطلب...</p>}

          {error && !loading && (
            <section className="os-card-box" role="alert">
              <p className="os-card-subtext">{error.message || 'تعذّر تحميل حالة الطلب.'}</p>
              <button className="os-whatsapp-btn" type="button" onClick={reload}>
                <span className="os-symbol" style={{ fontSize: '20px' }}>refresh</span>
                <span>إعادة المحاولة</span>
              </button>
            </section>
          )}

          {!loading && !error && (
            <>
              <div className="os-status-bar">
                <div className="os-live-status">
                  <span className="os-pulse-dot"></span>
                  <span>قيد المراجعة</span>
                </div>
                <button className="os-icon-btn" type="button" onClick={reload} aria-label="تحديث الحالة">
                  <span className="os-symbol" style={{ fontSize: '20px' }}>refresh</span>
                </button>
              </div>

              <section className="os-card-box">
                <div className="os-logo-wrapper">
                  <img alt="شعار جامعة حمص" className="os-logo-img" src={universityLogo} />
                </div>

                <div className="os-badge-pending">
                  <span className="os-symbol os-spin-icon">hourglass_top</span>
                  <span>قيد المعالجة</span>
                </div>

                <h2 className="os-card-headline">تم استلام طلبك وجارٍ التحقق منه</h2>
                <p className="os-card-subtext">
                  يقوم الاتحاد بمراجعة دفعتك والتأكد من إشعار التحويل من تطبيق{' '}
                  <strong>شام كاش</strong>. تستغرق العملية عادةً من{' '}
                  <span className="highlight">ساعتين إلى 24 ساعة</span>.
                </p>

                <div className="os-dashed-divider"></div>

                <div className="os-meta-list">
                  <div className="os-meta-row">
                    <span className="os-meta-label">
                      <span className="os-symbol" style={{ fontSize: '16px', color: '#124d44' }}>
                        confirmation_number
                      </span>
                      نوع التذكرة:
                    </span>
                    <span className="os-meta-val">
                      {ticket?.companions_count != null ? companionsLabel(ticket.companions_count) : '—'}
                    </span>
                  </div>

                  <div className="os-meta-row">
                    <span className="os-meta-label">
                      <span className="os-symbol" style={{ fontSize: '16px', color: '#124d44' }}>
                        payments
                      </span>
                      المبلغ المدفوع:
                    </span>
                    <span className="os-meta-val primary">{amountText}</span>
                  </div>

                  <div className="os-meta-row">
                    <span className="os-meta-label">
                      <span className="os-symbol" style={{ fontSize: '16px', color: '#124d44' }}>
                        calendar_today
                      </span>
                      تاريخ الطلب:
                    </span>
                    <span className="os-meta-val">{formatDate(ticket?.created_at)}</span>
                  </div>
                </div>

                {event?.whatsapp_group_link && (
                  <>
                    <div className="os-dashed-divider"></div>
                    <div className="os-community-section">
                      <div className="os-community-header">
                        <div>
                          <h3 className="os-community-title">{event.name}</h3>
                          <span className="os-community-subtitle">القناة الرسمية المعتمدة</span>
                        </div>
                        <div className="os-community-icon-bg">
                          <span className="os-symbol" style={{ fontSize: '24px' }}>
                            groups
                          </span>
                        </div>
                      </div>

                      <p className="os-community-text">
                        تابع آخر إعلانات البروفات ومواعيد استلام روب التخرج أولاً بأول عبر مجموعة واتساب الرسمية.
                      </p>

                      <a
                        className="os-whatsapp-btn"
                        href={event.whatsapp_group_link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="os-symbol" style={{ fontSize: '20px' }}>forum</span>
                        <span>الانضمام إلى مجموعة الحفل</span>
                      </a>
                    </div>
                  </>
                )}
              </section>

              <p style={{ textAlign: 'center', margin: '0 0 12px' }}>
                <Link to="/guide/ticket">ماذا بعد تأكيد الدفع؟</Link>
              </p>

              <div className="os-reassurance-bar">
                <span className="os-symbol" style={{ color: '#ca4b00', fontSize: '19px', flexShrink: 0 }}>
                  notifications_active
                </span>
                <p className="os-reassurance-text">
                  سيصلك إشعار عبر الرسائل النصية وتطبيق شام كاش فور تدقيق طلبك.
                </p>
              </div>
            </>
          )}
        </div>

        <footer className="os-footer">
          <HelpFooter />
          <p className="os-footer-main">{CEREMONY_TITLE}</p>
          <p className="os-footer-sub">لجنة تنظيم وتنسيق حفلات التخرج المركزية</p>
        </footer>
      </main>
    </div>
  );
}
