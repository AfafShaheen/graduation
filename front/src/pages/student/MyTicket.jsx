import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import '../../style/MyTicket.css';
import '../../style/BrandHeader.css';
import unionLogo from '../../assets/only-logo.png';
import useMyTicket from '../../hooks/useMyTicket';
import { getMyProfile } from '../../api/graduate';
import { getGraduateToken } from '../../api/session';
import topRankLabel, { TOP_STUDENT_TITLE } from '../../utils/topRank';
import { CEREMONY_TITLE, BATCH_BADGE } from '../../config/brand';
import HelpFooter from '../../components/HelpFooter';

const formatEventDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'full' }).format(date);
};

/* "18:30:00" -> "18:30" */
const formatEventTime = (value) => {
  if (!value) return '';
  const parts = String(value).split(':');
  if (parts.length < 2) return String(value);
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
};

export default function MyTicket() {
  const { data, loading, error, reload } = useMyTicket();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;
    const accessValue = getGraduateToken();
    if (!accessValue) return undefined;
    getMyProfile(accessValue)
      .then((res) => {
        if (mounted) setProfile(res);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title: `تذكرتي - ${CEREMONY_TITLE}` });
    } catch {
      /* المستخدم ألغى المشاركة */
    }
  };

  if (loading && !data) {
    return (
      <div className="tk-app-container">
        <main className="tk-mobile-shell">
          <div className="tk-main-stage">
            <p className="tk-student-faculty">جارٍ تحميل تذكرتك...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="tk-app-container">
        <main className="tk-mobile-shell">
          <div className="tk-main-stage">
            <p className="tk-student-faculty" role="alert">
              {error.message || 'تعذّر تحميل التذكرة.'}
            </p>
            <button className="tk-btn-primary" type="button" onClick={reload}>
              <span className="tk-symbol" style={{ fontSize: '20px' }}>refresh</span>
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  const ticket = data?.ticket;
  const event = data?.event;
  const seat = data?.seat;
  const codes = data?.qr_codes || [];
  const graduateCode = codes.find((c) => c.code_type === 'GRADUATE');
  const companionCodes = codes.filter((c) => c.code_type === 'COMPANION');
  const companionsCount = ticket?.companions_count ?? companionCodes.length;

  const studentName = profile?.full_name || profile?.name || '—';
  const faculty = profile?.college_name || profile?.college?.name || '—';
  const universityId = profile?.university_id || '—';
  const eventTitle = event?.name || CEREMONY_TITLE;
  const eventDateText = formatEventDate(event?.event_date);
  const eventTimeText = formatEventTime(event?.event_time);
  const topRank = topRankLabel(data?.top_rank);

  return (
    <div className="tk-app-container">
      <main className="tk-mobile-shell">
        <header className="tk-header-main">
          <div className="tk-header-top">
            <div className="tk-icon-btn static">
              <img className="tk-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            </div>

            <h1 className="tk-header-title">{CEREMONY_TITLE}</h1>

            <button
              aria-label="مشاركة التذكرة"
              className="tk-icon-btn"
              type="button"
              onClick={handleShare}
            >
              <span className="tk-symbol" style={{ fontSize: '20px' }}>
                share
              </span>
            </button>
          </div>

          <div className="tk-header-subband">
            <span className="tk-subband-title">تذكرتي</span>
            <span className="tk-badge-batch">{BATCH_BADGE}</span>
          </div>
        </header>

        <div className="tk-main-stage">
          <div className="tk-status-header">
            <div className="tk-status-group">
              <span className="tk-symbol" style={{ color: '#124d44', fontSize: '20px' }}>
                verified
              </span>
              <span className="tk-status-title">تذكرة الخريج الرسمية</span>
            </div>
            <span className="tk-badge-confirmed">مؤكدة</span>
          </div>

          <section className="tk-card-box">
            <div className="tk-card-banner">
              <div className="tk-banner-tag">
                <span className="tk-symbol" style={{ color: '#ffb598', fontSize: '20px' }}>
                  school
                </span>
                <span>{eventTitle}</span>
              </div>
              <span className="tk-banner-pill">تذكرة خريج</span>
            </div>

            <div className="tk-card-body">
              <h2 className="tk-student-name">{studentName}</h2>
              <p className="tk-student-faculty">
                <span className="tk-symbol" style={{ fontSize: '16px' }}>
                  laptop_chromebook
                </span>
                {faculty}
              </p>

              <div className="tk-meta-row">
                <div className="tk-meta-col">
                  <span className="tk-meta-label">الرقم الجامعي</span>
                  <span className="tk-meta-value">{universityId}</span>
                </div>
                <div className="tk-meta-divider"></div>
                <div className="tk-meta-col">
                  <span className="tk-meta-label">المقعد</span>
                  <span className="tk-meta-value">{seat?.graduate || 'يُحدَّد المقعد بعد تأكيد الدفع'}</span>
                </div>
              </div>

              {(eventDateText || eventTimeText) && (
                <div className="tk-meta-row">
                  <div className="tk-meta-col">
                    <span className="tk-meta-label">تاريخ الحفل</span>
                    <span className="tk-meta-value">{eventDateText || '—'}</span>
                  </div>
                  <div className="tk-meta-divider"></div>
                  <div className="tk-meta-col">
                    <span className="tk-meta-label">وقت الحفل</span>
                    <span className="tk-meta-value">{eventTimeText || '—'}</span>
                  </div>
                </div>
              )}

              {seat?.companions?.length ? (
                <div className="tk-meta-row">
                  <div className="tk-meta-col">
                    <span className="tk-meta-label">مقاعد المرافقين</span>
                    <span className="tk-meta-value" dir="ltr">{seat.companions.join('، ')}</span>
                  </div>
                </div>
              ) : null}

              {topRank && (
                <div
                  role="status"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    margin: '0 auto 12px',
                    padding: '8px 14px',
                    borderRadius: '999px',
                    background: '#fff4e5',
                    border: '1px solid #ffb598',
                    color: '#8a4b1f',
                    fontWeight: 600,
                    width: 'fit-content',
                  }}
                >
                  <span className="tk-symbol" style={{ fontSize: '18px' }}>
                    workspace_premium
                  </span>
                  <span>
                    {TOP_STUDENT_TITLE} — {topRank}
                  </span>
                </div>
              )}

              <div className="tk-qr-box">
                <div className="tk-qr-relative">
                  {graduateCode ? (
                    <QRCodeSVG
                      value={graduateCode.code_value}
                      size={168}
                      className="tk-qr-svg"
                      aria-label="رمز QR للتحقق من التذكرة"
                    />
                  ) : (
                    <p className="tk-student-faculty">لم يصدر رمز التحقق بعد.</p>
                  )}
                </div>
                {graduateCode && <span className="tk-meta-label">{graduateCode.code_value}</span>}
              </div>
            </div>
          </section>

          <p style={{ textAlign: 'center', margin: '0 0 12px' }}>
            <Link to="/guide/ticket">إرشادات يوم الحفل</Link>
          </p>

          {companionCodes.length > 0 && (
            <section className="tk-companions-box">
              <div className="tk-companions-header">
                <div className="tk-companions-title-group">
                  <span className="tk-symbol" style={{ color: '#124d44', fontSize: '18px' }}>
                    groups
                  </span>
                  <h3 className="tk-companions-title">تذاكر المرافقين ({companionsCount})</h3>
                </div>
                <span className="tk-companions-hint">
                  <span className="tk-symbol" style={{ fontSize: '14px' }}>
                    info
                  </span>
                  تُفعَّل تلقائياً بعد مسح كود الخريج
                </span>
              </div>

              <div className="tk-companions-grid">
                {companionCodes.map((code, idx) => (
                  <div key={code.id} className="tk-companion-card">
                    <QRCodeSVG
                      value={code.code_value}
                      size={110}
                      className="tk-qr-svg"
                      aria-label={`رمز QR للمرافق ${idx + 1}`}
                    />
                    <span className="tk-companion-name">المرافق {idx + 1}</span>
                    {seat?.companions?.[idx] && (
                      <span className="tk-meta-label">المقعد: {seat.companions[idx]}</span>
                    )}
                    <span className="tk-companion-status">
                      {code.scanned ? 'مستخدم' : 'قيد الانتظار'}
                    </span>
                    <span className="tk-meta-label">{code.code_value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {event?.whatsapp_group_link && (
            <div className="tk-actions-group">
              <a
                className="tk-btn-secondary"
                href={event.whatsapp_group_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="tk-symbol" style={{ fontSize: '18px' }}>
                  forum
                </span>
                <span>الانضمام إلى مجموعة الحفل</span>
              </a>
            </div>
          )}

          <div className="tk-actions-group">
            <button type="button" className="tk-btn-primary" onClick={() => window.print()}>
              <span className="tk-symbol" style={{ fontSize: '20px' }}>
                download
              </span>
              <span>طباعة التذكرة / حفظ PDF</span>
            </button>
          </div>

          <footer className="tk-footer">
            <HelpFooter />
            <p className="tk-footer-main">{CEREMONY_TITLE}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
