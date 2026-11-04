import StageHeader from '../../components/StageHeader';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../style/OrderStatus.css';
import '../../style/BrandHeader.css';
import useMyTicket from '../../hooks/useMyTicket';
import { companionsLabel } from '../../utils/companions';
import GraduateFooter from '../../components/GraduateFooter';
import { QR_REQUIRED_TEXT, GROUP_TEXT } from '../../config/graduateTexts';
import { routeForTicket, ORDER_POLL_MS } from '../../utils/ticketRoute';
import EndedNotice from '../../components/EndedNotice';
import { ceremonyEnded, ENDED_PENDING_TEXT } from '../../utils/ceremonyState';
import useContactPhone from '../../hooks/useContactPhone';
import { REVIEW_USUAL_TEXT, isReviewDelayed, sentAtLabel, delayWhatsappHref } from '../../utils/reviewTime';

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
  // الرابط بيجي على المستوى الأعلى من الرد (مو جوا event)
  const whatsappLink = data?.whatsapp_group_link;
  const contactPhone = useContactPhone();
  // the clock is read when the page opens (and when the data refreshes): nothing ticks on screen
  const [openedAt] = useState(() => Date.now());
  const sentAt = data?.payment_submitted_at || ticket?.created_at;
  const delayed = isReviewDelayed(sentAt, openedAt);
  const delayHref = delayWhatsappHref(contactPhone);
  const ended = ceremonyEnded(event?.event_date);

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
        <StageHeader current="payment" guide="submitted" sub="قيد المراجعة" />

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

              {/* تحذير واضح: على الخريج متابعة حالة طلبه بنفسه */}
              {ended && <EndedNotice>{ENDED_PENDING_TEXT}</EndedNotice>}

              <section className="os-critical-warning" role="alert">
                <div className="os-critical-head">
                  <span className="os-symbol os-critical-icon" aria-hidden="true">warning</span>
                  <h2 className="os-critical-title">تنبيه مهم، اقرأه جيداً</h2>
                </div>
                <p className="os-critical-text">
                  تأكّد بنفسك من حالة طلبك: عُد إلى هذا الموقع بعد المراجعة وتحقّق أن طلبك صار{' '}
                  <strong>«مؤكدة»</strong> وأن <strong>رمز QR</strong> ظهر لك.
                </p>
                <p className="os-critical-text strong">
                  {QR_REQUIRED_TEXT}
                </p>
                <p className="os-critical-text">
                  وإن تأخّر طلبك أو واجهتك أي مشكلة، راجعنا قبل موعد الحفل بوقت كافٍ.
                </p>
              </section>

              <section className="os-card-box">
<div className="os-badge-pending">
                  <span className="os-symbol os-spin-icon">hourglass_top</span>
                  <span>قيد المعالجة</span>
                </div>

                <h2 className="os-card-headline">تم استلام طلبك وجارٍ التحقق منه</h2>
                <p className="os-card-subtext">
                  يقوم الاتحاد بمراجعة دفعتك والتأكد من إشعار التحويل من تطبيق{' '}
                  <strong>شام كاش</strong>. <span className="highlight">{REVIEW_USUAL_TEXT}</span>
                </p>

                {delayed && (
                  <div className="os-delay-box" role="note">
                    <p>مضى على إرسال دفعتك أكثر من 24 ساعة. تأخّر طلبك؟ تواصل معنا.</p>
                    {delayHref && (
                      <a className="os-whatsapp-btn" href={delayHref} target="_blank" rel="noopener noreferrer">
                        <span>تواصل عبر واتساب</span>
                      </a>
                    )}
                  </div>
                )}

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
                      وقت إرسال الدفع:
                    </span>
                    <span className="os-meta-val">{sentAtLabel(sentAt) || formatDate(sentAt)}</span>
                  </div>
                </div>

                {whatsappLink && (
                  <>
                    <div className="os-dashed-divider"></div>
                    <div className="os-community-section">
                      <div className="os-community-header">
                        <div>
                          <h3 className="os-community-title">{event?.name}</h3>
                          <span className="os-community-subtitle">القناة الرسمية المعتمدة</span>
                        </div>
                        <div className="os-community-icon-bg">
                          <span className="os-symbol" style={{ fontSize: '24px' }}>
                            groups
                          </span>
                        </div>
                      </div>

                      <p className="os-community-text">
                        {GROUP_TEXT}
                      </p>

                      <a
                        className="os-whatsapp-btn"
                        href={whatsappLink}
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


              <div className="os-reassurance-bar">
                <span className="os-symbol" style={{ color: '#ca4b00', fontSize: '19px', flexShrink: 0 }}>
                  notifications_active
                </span>
              </div>
            </>
          )}
        </div>

        <GraduateFooter />
      </main>
    </div>
  );
}