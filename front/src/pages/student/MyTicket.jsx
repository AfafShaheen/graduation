import StageHeader from '../../components/StageHeader';
import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import '../../style/MyTicket.css';
import '../../style/BrandHeader.css';
import useMyTicket from '../../hooks/useMyTicket';
import { getMyProfile } from '../../api/graduate';
import { getGraduateToken } from '../../api/session';
import topRankLabel, { TOP_STUDENT_TITLE } from '../../utils/topRank';
import { CEREMONY_TITLE } from '../../config/brand';
import GraduateFooter from '../../components/GraduateFooter';
import { ID_PROOF_TEXT } from '../../config/graduateTexts';
import { welcomeText } from '../../utils/welcome';
import { daysUntil, eventCountdownText } from '../../utils/countdown';
import { ceremonyEnded } from '../../utils/ceremonyState';
import { downloadQrPng, downloadQrPngs, shareQrPng, qrFileName } from '../../utils/qrDownload';

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

const SHARE_TEXT = 'رمز دخولك إلى حفل التخرج. أبرزه عند الباب بعد دخول الخريج.';

export default function MyTicket() {
  const { data, loading, error, reload } = useMyTicket();
  const [profile, setProfile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const qrRefs = useRef({});

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
  const ended = ceremonyEnded(event?.event_date);
  const countdown = ended ? '' : eventCountdownText(daysUntil(event?.event_date));

  // ===== تنزيل رموز QR كصور =====
  const graduateItem = graduateCode
    ? {
        codeId: graduateCode.id,
        filename: qrFileName('GRADUATE', 0, universityId),
        lines: [`رمز الخريج: ${studentName}`, eventTitle],      }
    : null;
  const companionItems = companionCodes.map((code, idx) => ({
    codeId: code.id,
    filename: qrFileName('COMPANION', idx + 1, universityId),
    lines: [`المرافق ${idx + 1}`, `مرافق الخريج: ${studentName}`],
  }));

  // يُستدعى من الأزرار فقط (خارج الرسم)
  const svgFor = (codeId) => qrRefs.current[codeId]?.querySelector('svg') || null;

  const runDownload = async (items) => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadQrPngs(items.map((it) => ({ ...it, svg: svgFor(it.codeId) })));
    } finally {
      setDownloading(false);
    }
  };
  const downloadOne = (item) => {
    downloadQrPng(svgFor(item.codeId), item.filename, item.lines);
  };
  // sends the companion his own code through the phone's share sheet (WhatsApp...)
  const shareOne = async (item) => {
    const result = await shareQrPng(svgFor(item.codeId), item.filename, item.lines, SHARE_TEXT);
    setShareNote(result === 'downloaded' ? 'تم تنزيل الصورة على جهازك، أرسلها لمرافقك من الاستديو أو من واتساب.' : '');
  };

  return (
    <div className="tk-app-container">
      <main className="tk-mobile-shell">
        <StageHeader current="ticket" guide="ticket" action={{ label: 'مشاركة التذكرة', icon: 'share', onClick: handleShare }} />

        <div className="tk-main-stage">
          <section className="tk-welcome" aria-label="ترحيب">
            <p className="tk-welcome-text">{welcomeText(faculty, { ended })}</p>
            {countdown && <p className="tk-countdown" key={countdown}>{countdown}</p>}
          </section>

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
                <div
                  className="tk-qr-relative"
                  ref={(el) => {
                    if (graduateCode) qrRefs.current[graduateCode.id] = el;
                  }}
                >
                  {graduateCode ? (
                    <QRCodeSVG
                      value={graduateCode.code_value}
                      size={168}
                      marginSize={2}
                      className="tk-qr-svg"
                      aria-label="رمز QR للتحقق من التذكرة"
                    />
                  ) : (
                    <p className="tk-student-faculty">لم يصدر رمز التحقق بعد.</p>
                  )}
                </div>
                {graduateCode && <span className="tk-meta-label">{graduateCode.code_value}</span>}
                {graduateCode && (
                  <button type="button" className="tk-qr-download" onClick={() => downloadOne(graduateItem)}>
                    <span className="tk-symbol" style={{ fontSize: '16px' }}>download</span>
                    <span>تنزيل رمزي كصورة</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* تذكير: إثبات الشخصية مطلوب يوم الحفل */}
          <section className="tk-id-reminder" role="note">
            <span className="tk-symbol tk-id-reminder-icon" aria-hidden="true">badge</span>
            <div className="tk-id-reminder-body">
              <h3 className="tk-id-reminder-title">لا تنسَ إحضار إثبات شخصيتك</h3>
              <p className="tk-id-reminder-text">{ID_PROOF_TEXT}</p>
            </div>
          </section>


          {companionCodes.length > 0 && (
            <section className="tk-companions-box">
              <div className="tk-companions-header">
                <div className="tk-companions-title-group">
                  <span className="tk-symbol" style={{ color: '#124d44', fontSize: '18px' }}>
                    groups
                  </span>
                  <h3 className="tk-companions-title">تذاكر المرافقين ({companionsCount})</h3>
                </div>
              </div>

              <div className="tk-companions-important" role="note">
                <p className="tk-companions-important-title">
                  <span className="tk-symbol" style={{ fontSize: '18px' }}>priority_high</span>
                  مهم جداً: بدون رمزه لن يدخل المرافق
                </p>
                <ul>
                  <li>كل مرافق يدخل <strong>برمزه الخاص فقط</strong>، وكل رمز يُستخدم مرة واحدة.</li>
                  <li>رموز المرافقين <strong>لا تعمل قبل مسح رمزك أنت</strong>، لذلك ادخلوا معاً.</li>
                  <li>نزّل صورة كل رمز وأرسلها لصاحبها، أو احتفظ بها كلها على هاتفك.</li>
                  <li>لا تنشر الرموز ولا تعطها لغير مرافقيك: إذا استخدم شخص آخر الرمز، لن يتمكن مرافقك من الدخول به.</li>
                </ul>
              </div>

              <div className="tk-companions-grid">
                {companionCodes.map((code, idx) => (
                  <div key={code.id} className="tk-companion-card">
                    <div
                      className="tk-companion-qr"
                      ref={(el) => {
                        qrRefs.current[code.id] = el;
                      }}
                    >
                      <QRCodeSVG
                        value={code.code_value}
                        size={132}
                        marginSize={2}
                        className="tk-qr-svg"
                        aria-label={`رمز QR للمرافق ${idx + 1}`}
                      />
                    </div>
                    <span className="tk-companion-name">المرافق {idx + 1}</span>
                    <span className="tk-companion-status">
                      {code.scanned ? 'مستخدم' : 'قيد الانتظار'}
                    </span>
                    <span className="tk-meta-label">{code.code_value}</span>
                    <button
                      type="button"
                      className="tk-qr-download"
                      onClick={() => downloadOne(companionItems[idx])}
                    >
                      <span className="tk-symbol" style={{ fontSize: '16px' }}>download</span>
                      <span>تنزيل كصورة</span>
                    </button>
                    <button
                      type="button"
                      className="tk-qr-download tk-qr-share"
                      onClick={() => shareOne(companionItems[idx])}
                    >
                      <span className="tk-symbol" style={{ fontSize: '16px' }}>share</span>
                      <span>إرسال لمرافقك</span>
                    </button>
                  </div>
                ))}
              </div>
              {shareNote && (
                <p className="tk-share-note" role="status">{shareNote}</p>
              )}
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
            <button
              type="button"
              className="tk-btn-primary"
              disabled={downloading || !graduateCode}
              onClick={() => runDownload([graduateItem, ...companionItems].filter(Boolean))}
            >
              <span className="tk-symbol" style={{ fontSize: '20px' }}>
                download
              </span>
              <span>{downloading ? 'جارٍ تنزيل الصور...' : 'تنزيل كل رموز QR كصور'}</span>
            </button>
            <p className="tk-download-note">
              تُحفظ صورة منفصلة لكل رمز. إذا سألك المتصفح عن السماح بتنزيل عدة ملفات، اختر «السماح».
            </p>
          </div>

          <GraduateFooter />
        </div>
      </main>
    </div>
  );
}