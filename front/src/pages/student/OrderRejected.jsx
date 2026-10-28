import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../style/OrderRejected.css';
import unionLogo from '../../assets/only-logo.png';
import useMyTicket from '../../hooks/useMyTicket';
import { getPublicSettings } from '../../api/graduate';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';

export default function OrderRejected() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useMyTicket();
  const [contactPhone, setContactPhone] = useState('');

  useEffect(() => {
    let mounted = true;
    getPublicSettings()
      .then((res) => {
        if (mounted) setContactPhone(res?.contact_phone || '');
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const rejectionReason =
    data?.ticket?.rejection_reason || 'لم يُرفق سبب الرفض. يرجى التواصل مع الدعم للاستفسار.';
  const supportHref = contactPhone ? `tel:${contactPhone}` : undefined;
  const registrationOpen = Boolean(data?.registration?.is_open);

  return (
    <div className="or-app-container">
      <main className="or-mobile-shell">
        <header className="or-header-main">
          <div className="or-header-top">
            <div className="or-icon-btn static" aria-hidden="true"></div>

            <h1 className="or-header-title">{CEREMONY_TITLE}</h1>

            <div className="or-icon-btn static">
              <img className="or-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>
          </div>

          <div className="or-header-subband">
            <span className="or-subband-title">حالة الطلب</span>
            <span className="or-badge-batch">{BATCH_BADGE}</span>
          </div>
        </header>

        <div className="or-content-body">
          <section className="or-card-box">
            <div className="or-error-outer-circle">
              <div className="or-error-inner-circle">
                <span className="or-symbol" style={{ fontSize: '24px', fontWeight: '700' }}>
                  close
                </span>
              </div>
            </div>

            <div className="or-badge-rejected">
              <span className="or-badge-dot"></span>
              <span className="or-badge-text">الطلب مرفوض</span>
            </div>

            <h2 className="or-card-headline">تعذّر تأكيد عملية الدفع</h2>
            <p className="or-card-subtext">
              راجعنا بيانات التحويل المرسلة وتبيّن وجود خطأ في مطابقة الإشعار.
            </p>

            {loading && !data && <p className="or-card-subtext">جارٍ تحميل تفاصيل الرفض...</p>}

            {error && !loading && (
              <p className="or-reason-desc" role="alert">
                {error.message || 'تعذّر تحميل تفاصيل الرفض.'}{' '}
                <button type="button" className="or-retry-link" onClick={reload}>
                  إعادة المحاولة
                </button>
              </p>
            )}

            {!error && (
              <div className="or-reason-box">
                <div className="or-reason-item">
                  <span
                    className="or-symbol"
                    style={{ color: '#ba1a1a', fontSize: '20px', flexShrink: 0, marginTop: '2px' }}
                  >
                    error
                  </span>
                  <div>
                    <span className="or-reason-title">سبب الرفض:</span>
                    <p className="or-reason-desc">{rejectionReason}</p>
                  </div>
                </div>

                <div className="or-reason-divider">
                  <span
                    className="or-symbol"
                    style={{ color: '#124d44', fontSize: '18px', flexShrink: 0, marginTop: '2px' }}
                  >
                    info
                  </span>
                  <p className="or-reason-desc">
                    {registrationOpen
                      ? 'يرجى التأكد من كتابة رقم العملية المكتوب في إشعار شام كاش بدقة، ثم إعادة إرسال بيانات الدفع.'
                      : 'انتهت فترة التسجيل، لم يعد إرسال بيانات الدفع متاحاً.'}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="or-bottom-dock">
          {registrationOpen && (
            <button
              className="or-resubmit-btn"
              type="button"
              onClick={() => navigate('/payment', { replace: true })}
            >
              <span className="or-symbol" style={{ fontSize: '20px' }}>
                refresh
              </span>
              <span>إعادة إرسال بيانات الدفع</span>
            </button>
          )}

          <a
            href={supportHref || undefined}
            className="or-support-link"
            {...(contactPhone ? {} : { 'aria-disabled': true })}
            onClick={(e) => {
              if (!supportHref) e.preventDefault();
            }}
          >
            <span className="or-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>
              support_agent
            </span>
            <span className="or-support-text">
              {contactPhone ? `للتواصل مع الدعم: ${contactPhone}` : 'هل تواجه مشكلة؟ تواصل مع الدعم الفني للاتحاد'}
            </span>
          </a>

          <footer className="or-footer">
            <p className="or-footer-text">{CEREMONY_TITLE}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
