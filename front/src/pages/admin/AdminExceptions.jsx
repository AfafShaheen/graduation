import React, { useState, useEffect, useRef } from 'react';
import '../../style/AdminExceptions.css';
import AdminSidebar from '../../components/AdminSidebar';
import {
  useAdminGraduates,
  getGraduateDetail,
  manualCheckIn,
  revertScan,
  revertPayment,
  updateGraduateEmail,
} from './hooks/useAdminGraduates.js';
import { useAdminAudit } from './hooks/useAdminAudit.js';
import { ApiError } from '../../api/admin.js';

const TICKET_STATUS_LABELS = {
  CONFIRMED: 'مؤكد',
  PROCESSING: 'قيد المعالجة',
  AWAITING_PAYMENT: 'بانتظار الدفع',
  REJECTED: 'مرفوض',
};

const QR_TYPE_LABELS = {
  GRADUATE: 'رمز الخريج',
  COMPANION: 'رمز مرافق',
};

const TICKET_TYPE_LABELS = {
  TWO_COMPANIONS: 'خريج + ٢ مرافقان',
  THREE_COMPANIONS: 'خريج + ٣ مرافقين',
};

const nowLabel = () =>
  new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Damascus',
  }).format(new Date());

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Damascus',
  }).format(d);
};

const initialsOf = (name) => {
  if (!name) return '؟';
  return name
    .replace(/^(م\.|د\.|أ\.)\s*/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('.');
};

export default function AdminExceptions({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');

  const detailRequest = useRef(0);

  const { items: results, loading: searchLoading, error: searchError } = useAdminGraduates({
    search: debouncedQuery.trim(),
    limit: 20,
  });

  const { data: auditData, loading: auditLoading, error: auditError } = useAdminAudit({
    exceptionalOnly: true,
    limit: 50,
  });
  const logs = auditData?.items || [];

  // تأخير البحث حتى يتوقف المستخدم عن الكتابة
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // إخفاء الإشعار تلقائياً
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const loadDetail = async (id) => {
    if (!id) return;
    const reqId = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError('');
    setActionError('');
    try {
      const res = await getGraduateDetail(id);
      if (detailRequest.current === reqId) setDetail(res);
    } catch (e) {
      if (detailRequest.current === reqId) {
        setDetail(null);
        setDetailError(e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.');
      }
    } finally {
      if (detailRequest.current === reqId) setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  useEffect(() => {
    setEditingEmail(false);
  }, [selectedId]);

  const ticket = detail?.tickets?.[0] || null;
  const ticketStatus = ticket?.status || '';
  const isConfirmed = ticketStatus === 'CONFIRMED';

  const runAction = async (fn, successFallback) => {
    if (!detail) return;
    setBusy(true);
    setActionError('');
    try {
      const res = await fn();
      setNotice(res?.message || successFallback);
      await loadDetail(detail.id);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'تعذّر تنفيذ الإجراء، حاول مجدداً.');
    } finally {
      setBusy(false);
    }
  };

  const handleManualEntry = () =>
    runAction(() => manualCheckIn(detail.id), 'تم تسجيل الدخول اليدوي.');

  const handleCancelScan = () =>
    runAction(() => revertScan(detail.id), 'تم إلغاء المسح السابق.');

  const handleReturnPending = () => {
    if (!ticket) return;
    runAction(() => revertPayment(ticket.id), 'تم إرجاع الدفع لقيد المعالجة.');
  };

  const handleSaveEmail = (e) => {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email || !detail) return;
    runAction(() => updateGraduateEmail(detail.id, email), 'تم تحديث البريد الإلكتروني.')
      .then(() => setEditingEmail(false));
  };

  return (
    <div className="exc-app-container">
      <div className="exc-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="actions"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="exc-topbar">
        <button
          type="button"
          className="exc-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="exc-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="exc-topbar-title">
          <h2>إجراءات استثنائية</h2>
          <span>بوابة الإشراف المباشر</span>
        </div>

        <div className="exc-topbar-actions">
          <div className="exc-clock-pill">
            <span className="exc-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>schedule</span>
            <span>{nowLabel()}</span>
          </div>
        </div>
      </header>

      {/* المحتوى */}
      <main className="exc-main-canvas">
        <section className="exc-hero-titles">
          <div className="exc-pulse-tag">
            <span className="exc-mini-dot"></span>
            <span className="exc-pulse-label">إجراءات استثنائية</span>
          </div>
          <h3>طوارئ الدخول وتصحيح حالات التذاكر</h3>
          <p>ابحث عن تذكرة خريج للتعامل مع أعطال الماسحات أو المسح المكرر، وكل إجراء بيتسجل تلقائياً باسمك بالسجل الرقابي.</p>
        </section>

        {notice && (
          <div className="exc-notice" role="status">
            <span className="exc-symbol" style={{ fontSize: '18px' }}>check_circle</span>
            <span>{notice}</span>
          </div>
        )}

        {/* البحث */}
        <section className="exc-card">
          <h4 className="exc-card-title">البحث الفوري عن تذكرة خريج</h4>
          <p className="exc-card-sub">دوّر بالاسم أو الرقم الجامعي، وبتظهر النتائج مباشرة.</p>

          <div className="exc-search-row">
            <div className="exc-search-box">
              <input
                type="text"
                autoComplete="off"
                className="exc-input"
                placeholder="مثال: كنان أو 88291..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="exc-symbol exc-input-icon" style={{ fontSize: '22px' }}>search</span>
            </div>
          </div>

          {searchError && (
            <div className="exc-empty" role="alert">
              <span className="exc-symbol">error</span>
              <span>{searchError}</span>
            </div>
          )}

          {!searchError && debouncedQuery.trim() && (
            <div className="exc-quick" style={{ flexWrap: 'wrap' }}>
              {searchLoading ? (
                <span className="exc-quick-label">جارٍ البحث...</span>
              ) : results.length === 0 ? (
                <span className="exc-quick-label">ما في نتائج مطابقة لـ &quot;{debouncedQuery.trim()}&quot;</span>
              ) : (
                results.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="exc-quick-btn"
                    onClick={() => setSelectedId(g.id)}
                  >
                    {g.full_name} — <span className="num">{g.university_id}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        {/* الحالة الفارغة */}
        {!debouncedQuery.trim() && (
          <section className="exc-card">
            <div className="exc-empty">
              <span className="exc-symbol">manage_search</span>
              <span>اكتب اسم الخريج أو رقمه الجامعي لعرض التذكرة والإجراءات المتاحة</span>
            </div>
          </section>
        )}

        {debouncedQuery.trim() && !selectedId && (
          <section className="exc-card">
            <div className="exc-empty">
              <span className="exc-symbol">arrow_upward</span>
              <span>اختر خريجاً من نتائج البحث لعرض تفاصيل التذكرة والإجراءات المتاحة</span>
            </div>
          </section>
        )}

        {selectedId && detailLoading && (
          <section className="exc-card">
            <div className="exc-empty">
              <span className="exc-symbol">hourglass_top</span>
              <span>جارٍ تحميل بيانات الخريج...</span>
            </div>
          </section>
        )}

        {selectedId && !detailLoading && detailError && (
          <section className="exc-card">
            <div className="exc-empty" role="alert">
              <span className="exc-symbol">error</span>
              <span>{detailError}</span>
            </div>
          </section>
        )}

        {selectedId && !detailLoading && detail && (
          <section className="exc-card flush">
            <div className="exc-ticket-head">
              <div className="exc-ticket-head-main">
                <div className="exc-ticket-head-icon">
                  <span className="exc-symbol">school</span>
                </div>
                <div>
                  <h4>
                    <span>بطاقة تذكرة الخريج</span>
                    {ticket && (
                      <span className="exc-batch-pill">
                        {TICKET_STATUS_LABELS[ticketStatus] || ticketStatus || '—'}
                      </span>
                    )}
                  </h4>
                  <p>رقم التذكرة: {ticket ? ticket.id : '—'}</p>
                </div>
              </div>

              <span className="exc-scan-pill">
                <span className="exc-symbol" style={{ fontSize: '18px' }}>
                  {ticket ? 'confirmation_number' : 'radio_button_unchecked'}
                </span>
                <span>{ticket ? (TICKET_STATUS_LABELS[ticketStatus] || ticketStatus) : 'لا توجد تذكرة'}</span>
              </span>
            </div>

            <div className="exc-ticket-body">
              <div className="exc-info-grid">
                <div>
                  <span className="exc-info-label">اسم الخريج</span>
                  <div className="exc-info-value">
                    <span>{detail.full_name}</span>
                    <span className="exc-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>verified</span>
                  </div>
                  <span className="exc-info-sub">البريد: {detail.email || '—'}</span>
                </div>

                <div>
                  <span className="exc-info-label">الرقم الجامعي</span>
                  <div className="exc-info-value ltr">{detail.university_id}</div>
                  <span className="exc-info-sub">{detail.major_name || '—'}</span>
                </div>

                <div>
                  <span className="exc-info-label">الهاتف</span>
                  <div className="exc-info-value ltr">{detail.phone || '—'}</div>
                  <span className="exc-info-sub">حالة التحقق: {detail.email_verified ? 'موثّق' : 'غير موثّق'}</span>
                </div>

                <div>
                  <span className="exc-info-label">فئة التذكرة</span>
                  <div className="exc-info-value">
                    {ticket ? (TICKET_TYPE_LABELS[ticket.ticket_type] || '—') : '—'}
                  </div>
                  <span className="exc-info-sub">عدد المرافقين: {ticket?.companions_count ?? '—'}</span>
                </div>

                <div>
                  <span className="exc-info-label">المقاعد</span>
                  <div className="exc-info-value">{ticket?.seat?.range || '—'}</div>
                  <span className="exc-info-sub ltr">
                    {Array.isArray(ticket?.seat?.companions) && ticket.seat.companions.length
                      ? ticket.seat.companions.join('، ')
                      : 'لا توجد مقاعد بعد'}
                  </span>
                </div>

                <div>
                  <span className="exc-info-label">رموز QR</span>
                  {(detail.qr_codes || []).length === 0 ? (
                    <span className="exc-info-sub">لا توجد رموز بعد</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      {(detail.qr_codes || []).map((qr) => (
                        <span key={qr.id} className={`exc-pay-chip ${qr.is_activated ? 'confirmed' : 'pending'}`}>
                          {QR_TYPE_LABELS[qr.code_type] || qr.code_type}: {qr.scanned ? 'تم مسحه' : qr.is_activated ? 'مُفعّل' : 'غير مُفعّل'}
                          {qr.scanned_by_username ? ` (${qr.scanned_by_username})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(ticket?.rejection_reason || ticket?.confirmed_at) && (
                <div className="exc-info-grid" style={{ marginTop: '12px' }}>
                  {ticket?.rejection_reason && (
                    <div>
                      <span className="exc-info-label">سبب الرفض</span>
                      <div className="exc-info-value">{ticket.rejection_reason}</div>
                    </div>
                  )}
                  {ticket?.confirmed_at && (
                    <div>
                      <span className="exc-info-label">تاريخ التثبيت</span>
                      <div className="exc-info-value">{formatDateTime(ticket.confirmed_at)}</div>
                    </div>
                  )}
                </div>
              )}

              {(detail.payments || []).length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <span className="exc-info-label">سجل الدفعات</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    {(detail.payments || []).map((p) => (
                      <span key={p.id} className="exc-info-sub">
                        {p.sender_name || '—'} — {p.amount ?? '—'} — {formatDateTime(p.submitted_at)}
                        {p.reviewed_at ? ` (روجعت ${formatDateTime(p.reviewed_at)})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {actionError && (
                <div className="exc-alert" role="alert">
                  <span className="exc-symbol">error</span>
                  <p style={{ margin: 0 }}>{actionError}</p>
                </div>
              )}

              <div>
                <h5 className="exc-actions-title">الإجراءات الاستثنائية المتاحة للتذكرة:</h5>
                <div className="exc-actions-grid">
                  <button
                    type="button"
                    className="exc-action-btn primary"
                    onClick={handleManualEntry}
                    disabled={busy || !isConfirmed}
                    title={!isConfirmed ? 'التذكرة غير مؤكدة' : ''}
                  >
                    <span className="exc-symbol">how_to_reg</span>
                    <span>تسجيل دخول يدوي</span>
                  </button>

                  <button
                    type="button"
                    className="exc-action-btn"
                    onClick={handleCancelScan}
                    disabled={busy}
                  >
                    <span className="exc-symbol">restart_alt</span>
                    <span>إلغاء مسح خاطئ</span>
                  </button>

                  <button
                    type="button"
                    className="exc-action-btn warn"
                    onClick={handleReturnPending}
                    disabled={busy || !isConfirmed}
                    title={!isConfirmed ? 'التذكرة غير مؤكدة' : ''}
                  >
                    <span className="exc-symbol">pending</span>
                    <span>إرجاع الدفع لقيد المعالجة</span>
                  </button>

                  <button
                    type="button"
                    className="exc-action-btn"
                    onClick={() => {
                      setEmailDraft(detail.email || '');
                      setEditingEmail((v) => !v);
                    }}
                    disabled={busy}
                  >
                    <span className="exc-symbol">mark_email_read</span>
                    <span>تعديل البريد</span>
                  </button>
                </div>

                {editingEmail && (
                  <form className="exc-email-form" onSubmit={handleSaveEmail}>
                    <input
                      type="email"
                      dir="ltr"
                      className="exc-input"
                      aria-label="البريد الإلكتروني الجديد"
                      placeholder="البريد الإلكتروني الجديد"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      required
                    />
                    <div className="exc-email-actions">
                      <button type="submit" className="exc-btn-small solid" disabled={busy}>حفظ البريد</button>
                      <button type="button" className="exc-btn-small" onClick={() => setEditingEmail(false)}>
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>
        )}

        {/* سجل التدقيق */}
        <section className="exc-card flush">
          <div className="exc-log-head">
            <div>
              <div className="exc-log-title">
                <span className="exc-symbol" style={{ color: '#124d44', fontSize: '24px' }}>history_toggle_off</span>
                <h4 className="exc-card-title">سجل التدقيق الرقابي (Audit Log)</h4>
              </div>
              <p className="exc-card-sub">سجل لجميع العمليات الطارئة المنفّذة من المشرفين.</p>
            </div>
          </div>

          <div className="exc-table-wrapper">
            <table className="exc-table">
              <thead>
                <tr>
                  <th>المنفِّذ</th>
                  <th>الإجراء المتخذ</th>
                  <th>المستفيد / التذكرة</th>
                  <th>الوقت والتاريخ</th>
                </tr>
              </thead>
              <tbody>
                {auditLoading && (
                  <tr>
                    <td colSpan={4}>
                      <div className="exc-empty">
                        <span className="exc-symbol">hourglass_top</span>
                        <span>جارٍ تحميل السجل...</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!auditLoading && auditError && (
                  <tr>
                    <td colSpan={4}>
                      <div className="exc-empty" role="alert">
                        <span className="exc-symbol">error</span>
                        <span>{auditError}</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!auditLoading && !auditError && logs.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="exc-empty">
                        <span className="exc-symbol">inbox</span>
                        <span>لا توجد عمليات استثنائية مسجلة بعد</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!auditLoading && !auditError && logs.map((log) => (
                  <tr key={log.id}>
                    <td className="exc-td-exec">
                      <div className="exc-exec-cell">
                        <div className="exc-exec-avatar">{initialsOf(log.actor?.username)}</div>
                        <div>
                          <div className="exc-cell-main">{log.actor?.username || '—'}</div>
                          <div className="exc-cell-sub">{log.actor?.role_label || '—'}</div>
                        </div>
                      </div>
                    </td>

                    <td data-label="الإجراء المتخذ">
                      <div className="exc-action-name">
                        <span className="exc-action-dot"></span>
                        <span className="exc-cell-main">{log.action_label || log.action}</span>
                      </div>
                      <div className="exc-cell-sub">{log.details || '—'}</div>
                    </td>

                    <td data-label="المستفيد / التذكرة">
                      <div className="exc-cell-main">{log.graduate?.full_name || '—'}</div>
                      <div className="exc-cell-sub num">
                        {log.ticket_id != null ? `#${log.ticket_id}` : (log.graduate?.university_id || '—')}
                      </div>
                    </td>

                    <td data-label="الوقت والتاريخ">
                      <span className="exc-cell-sub" style={{ fontSize: '12px', color: '#201b0f' }}>
                        {formatDateTime(log.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="exc-log-footer">عرض {logs.length} عملية استثنائية مسجلة</div>
        </section>

        <p className="exc-footer-note">
          منظومة إدارة فعاليات التخرج المركزية
        </p>
      </main>
    </div>
  );
}
