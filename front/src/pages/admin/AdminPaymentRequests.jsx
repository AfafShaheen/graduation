import React, { useState, useEffect, useMemo, useCallback } from 'react';
import '../../style/AdminPaymentRequests.css';
import AdminSidebar from '../../components/AdminSidebar';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { fetchAllEventPayments, confirmTicket, rejectTicket } from './hooks/useAdminPayments.js';
import { adminBlob, downloadBlob, ApiError } from '../../api/admin.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

const STATUS_LABELS = {
  all: 'الكل',
  PROCESSING: 'قيد المعالجة',
  AWAITING_PAYMENT: 'بانتظار الدفع',
  CONFIRMED: 'مؤكدة',
  REJECTED: 'مرفوضة',
};

const STATUS_TO_UI = {
  PROCESSING: 'pending',
  AWAITING_PAYMENT: 'awaiting',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
};

const ALL_STATUSES = ['PROCESSING', 'AWAITING_PAYMENT', 'CONFIRMED', 'REJECTED'];

export default function AdminPaymentRequests({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onLogout,
  onAddTicket,
  onPendingChanged,
}) {
  const { events, loading: eventsLoading, error: eventsError } = useAdminEvents({ limit: 100 });

  const [ceremonyFilter, setCeremonyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('PROCESSING');
  const [searchQuery, setSearchQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // إغلاق القائمة بزر Escape / إغلاق نافذة الرفض
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setNavOpen(false);
      if (!rejecting) setRejectTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rejecting]);

  // اختيار أول حفل تلقائياً
  useEffect(() => {
    if (!ceremonyFilter && events.length) setCeremonyFilter(String(events[0].id));
  }, [events, ceremonyFilter]);

  const loadPayments = useCallback(async () => {
    if (!ceremonyFilter) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      let res;
      if (statusFilter === 'all') {
        const batches = await Promise.all(
          ALL_STATUSES.map((s) => fetchAllEventPayments(ceremonyFilter, s))
        );
        res = { items: batches.flatMap((b) => b.items) };
      } else {
        res = await fetchAllEventPayments(ceremonyFilter, statusFilter);
      }
      setItems(res.items || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [ceremonyFilter, statusFilter]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const mapped = useMemo(
    () =>
      items.map((it) => {
        const g = it.graduate || {};
        const p = it.payment || {};
        const guests = it.ticket_type === 'THREE_COMPANIONS' ? 3 : 2;
        const required = Number(it.price || 0);
        const paid = Number(p.amount || 0);
        return {
          ticketId: it.ticket_id,
          id: g.university_id || '—',
          name: g.full_name || '—',
          college: g.college_name || '',
          guests,
          required,
          paid,
          txRef: p.transaction_number || '—',
          senderName: p.sender_name || '—',
          mismatch: it.amount_mismatch != null ? !!it.amount_mismatch : paid !== required,
          status: STATUS_TO_UI[it.status] || (it.status || '').toLowerCase(),
        };
      }),
    [items]
  );

  const pendingCount = mapped.filter((i) => i.status === 'pending').length;
  const mismatchCount = mapped.filter((i) => i.status === 'pending' && i.mismatch).length;
  const confirmedItems = mapped.filter((i) => i.status === 'confirmed');
  const confirmedTotal = confirmedItems.reduce((sum, i) => sum + i.paid, 0);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mapped;
    return mapped.filter((i) =>
      [i.name, i.id, i.txRef, i.senderName].join(' ').toLowerCase().includes(q)
    );
  }, [mapped, searchQuery]);

  const selectedEvent = events.find((e) => String(e.id) === String(ceremonyFilter));

  const handleConfirm = async (item) => {
    setActionError('');
    setBusyId(item.ticketId);
    try {
      await confirmTicket(item.ticketId);
      await loadPayments();
      if (onPendingChanged) onPendingChanged();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.');
      if (e instanceof ApiError && e.status === 409) await loadPayments();
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (item) => {
    setActionError('');
    setRejectTarget(item);
    setRejectReason('');
    setRejectError('');
  };

  const submitReject = async () => {
    const reason = rejectReason.trim();
    if (reason.length < 3 || reason.length > 255) {
      setRejectError('سبب الرفض يجب أن يكون بين 3 و255 حرفاً');
      return;
    }
    setRejecting(true);
    setRejectError('');
    try {
      await rejectTicket(rejectTarget.ticketId, reason);
      setRejectTarget(null);
      await loadPayments();
      if (onPendingChanged) onPendingChanged();
    } catch (e) {
      setRejectError(e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.');
      if (e instanceof ApiError && e.status === 409) {
        setRejectTarget(null);
        await loadPayments();
      }
    } finally {
      setRejecting(false);
    }
  };

  const handleExport = async () => {
    try {
      const { blob, filename } = await adminBlob('/api/admin/export', {
        event_id: ceremonyFilter || undefined,
      });
      downloadBlob(blob, filename || 'payments.xlsx');
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'تعذّر تصدير الملف.');
    }
  };

  return (
    <div className="pay-req-app-container">
      <div className="pay-req-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="payments"
        onAddTicket={onAddTicket}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="pay-req-topbar">
        <button
          type="button"
          className="pay-req-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="pay-req-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="pay-req-topbar-title">
          <h2>طلبات الدفع</h2>
          <div className="pay-req-topbar-sub">
            <span className="pay-req-live-dot"></span>
            <span>تدقيق الدفع المباشر (شام كاش)</span>
            <span>•</span>
            <span>جامعة حمص</span>
          </div>
        </div>

        <div className="pay-req-topbar-actions">
          <button aria-label="التنبيهات" className="pay-req-icon-btn" title="التنبيهات" type="button">
            <span className="pay-req-symbol">notifications</span>
            <span className="pay-req-notif-dot"></span>
          </button>

          <button aria-label="التقويم" className="pay-req-icon-btn" title="التقويم" type="button">
            <span className="pay-req-symbol">calendar_today</span>
          </button>

          <button className="pay-req-help-btn" type="button">
            <span className="pay-req-symbol" style={{ fontSize: '18px' }}>help_outline</span>
            <span className="pay-req-help-text">المساعدة والدعم</span>
          </button>
        </div>
      </header>

      {/* المحتوى */}
      <main className="pay-req-main-canvas">
        <section className="pay-req-hero-titles">
          <div className="pay-req-pulse-tag">
            <span className="pay-req-mini-dot"></span>
            <span className="pay-req-pulse-label">طلبات الدفع</span>
            <span className="pay-req-pulse-venue">• بانتظار التدقيق: {pendingCount}</span>
          </div>
          <h3>تدقيق ومطابقة إشعارات شام كاش</h3>
          <p>قارن المبلغ المُدخل بالسعر المطلوب واسم المرسل، ثم أكّد الدفع لإصدار التذكرة أو ارفضه مع إشعار الطالب.</p>
        </section>

        {/* الإحصائيات */}
        <section className="pay-req-stats-grid">
          <div className="pay-req-stat-card">
            <div>
              <p className="pay-req-stat-label">إجمالي الطلبات المستلمة</p>
              <p className="pay-req-stat-value">{fmt(mapped.length)}</p>
              <p className="pay-req-stat-note">
                <span className="pay-req-symbol" style={{ fontSize: '16px' }}>trending_up</span>
                {selectedEvent ? selectedEvent.name : 'اختر حفلاً'}
              </p>
            </div>
            <div className="pay-req-stat-icon">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>receipt</span>
            </div>
          </div>

          <div className="pay-req-stat-card orange">
            <div>
              <p className="pay-req-stat-label orange">قيد التدقيق والمعالجة</p>
              <p className="pay-req-stat-value orange">{fmt(pendingCount)}</p>
              <p className="pay-req-stat-note orange">تتطلب مراجعة إشعار شام كاش</p>
            </div>
            <div className="pay-req-stat-icon orange">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>pending_actions</span>
            </div>
          </div>

          <div className="pay-req-stat-card">
            <div>
              <p className="pay-req-stat-label">حالات عدم تطابق المبلغ</p>
              <p className="pay-req-stat-value orange">{fmt(mismatchCount)}</p>
              <p className="pay-req-stat-note">تفاوت بين السعر والإشعار</p>
            </div>
            <div className="pay-req-stat-icon orange">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>warning</span>
            </div>
          </div>

          <div className="pay-req-stat-card">
            <div>
              <p className="pay-req-stat-label">المبالغ المؤكدة للاتحاد</p>
              <p className="pay-req-stat-value small">
                {fmt(confirmedTotal)} <span className="pay-req-stat-unit">ل.س</span>
              </p>
              <p className="pay-req-stat-note">{fmt(confirmedItems.length)} خريج مسدد بنجاح</p>
            </div>
            <div className="pay-req-stat-icon">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>account_balance_wallet</span>
            </div>
          </div>
        </section>

        {/* الفلاتر والبحث */}
        <section className="pay-req-filter-bar">
          <div className="pay-req-search-box">
            <input
              type="text"
              autoComplete="off"
              className="pay-req-search-input"
              placeholder="ابحث بالاسم، الرقم الجامعي، أو رقم الإشعار..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="pay-req-symbol pay-req-search-icon" style={{ fontSize: '18px' }}>search</span>
          </div>

          <div className="pay-req-filter-selects">
            <div className="pay-req-select-wrapper">
              <span className="pay-req-select-label">الحفل:</span>
              <select
                aria-label="تصفية حسب الحفل"
                value={ceremonyFilter}
                onChange={(e) => setCeremonyFilter(e.target.value)}
                disabled={eventsLoading || events.length === 0}
              >
                {events.length === 0 && <option value="">لا توجد حفلات</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={String(ev.id)}>{ev.name}</option>
                ))}
              </select>
            </div>

            <div className="pay-req-select-wrapper">
              <span className="pay-req-select-label">الحالة:</span>
              <select
                aria-label="تصفية حسب الحالة"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">{STATUS_LABELS.all}</option>
                <option value="PROCESSING">قيد المعالجة</option>
                <option value="AWAITING_PAYMENT">بانتظار الدفع</option>
                <option value="CONFIRMED">مؤكدة</option>
                <option value="REJECTED">مرفوضة</option>
              </select>
            </div>
          </div>
        </section>

        {/* الجدول */}
        <div className="pay-req-table-card">
          <div className="pay-req-table-header">
            <div className="pay-req-table-title">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>receipt_long</span>
              <div>
                <h4>جدول تدقيق ومطابقة طلبات الدفع</h4>
                <p>{selectedEvent ? selectedEvent.name : 'اختر حفلاً لعرض الطلبات'}</p>
              </div>
            </div>
            <div className="pay-req-table-tools">
              <button type="button" className="pay-req-tool-btn" onClick={handleExport} disabled={!ceremonyFilter}>
                <span className="pay-req-symbol" style={{ fontSize: '16px' }}>table_chart</span>
                <span>تصدير إكسل</span>
              </button>
              <button type="button" className="pay-req-tool-btn" onClick={loadPayments} disabled={loading}>
                <span className="pay-req-symbol" style={{ fontSize: '16px' }}>refresh</span>
                <span>تحديث</span>
              </button>
            </div>
          </div>

          {eventsError && <div className="pay-req-empty">{eventsError}</div>}
          {error && <div className="pay-req-empty">{error}</div>}
          {actionError && <div className="pay-req-empty">{actionError}</div>}
          {loading && <div className="pay-req-empty">جارٍ تحميل طلبات الدفع...</div>}

          {!loading && !error && (
            <div className="pay-req-table-wrapper">
              <table className="pay-req-table">
                <thead>
                  <tr>
                    <th>الخريج</th>
                    <th>الرقم الجامعي</th>
                    <th>نوع التذكرة</th>
                    <th>السعر المطلوب</th>
                    <th>رقم العملية</th>
                    <th>المبلغ المُدخل</th>
                    <th>اسم المرسل</th>
                    <th style={{ textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const mismatch = item.mismatch;
                    const diff = item.required - item.paid;
                    const pending = item.status === 'pending' || item.status === 'awaiting';
                    const rowKey = item.ticketId;

                    return (
                      <tr key={rowKey} className={mismatch && pending ? 'row-mismatch' : ''}>
                        <td className="pay-req-td-name">
                          <div className="pay-req-person-name">{item.name}</div>
                          <div className="pay-req-person-sub">{item.college}</div>
                        </td>

                        <td data-label="الرقم الجامعي">
                          <span className="pay-req-num">{item.id}</span>
                        </td>

                        <td data-label="نوع التذكرة">
                          <span className={`pay-req-ticket-chip ${item.guests === 3 ? 'group' : ''}`}>
                            <span className="pay-req-symbol">
                              {item.guests === 3 ? 'group_add' : 'confirmation_number'}
                            </span>
                            <span>خريج + {item.guests} مرافقين</span>
                          </span>
                        </td>

                        <td data-label="السعر المطلوب">
                          <span className="pay-req-amount">
                            {fmt(item.required)} <span className="pay-req-unit">ل.س</span>
                          </span>
                        </td>

                        <td data-label="رقم العملية">
                          <span className={`pay-req-txref ${mismatch ? 'mismatch' : ''}`}>{item.txRef}</span>
                        </td>

                        <td data-label="المبلغ المُدخل">
                          <div className={`pay-req-amount ${mismatch ? 'bad' : 'ok'}`}>
                            {fmt(item.paid)} <span className="pay-req-unit">ل.س</span>
                          </div>
                          {mismatch ? (
                            <span className="pay-req-mismatch-chip">
                              <span className="pay-req-symbol">error</span>
                              <span>
                                عدم تطابق ({diff > 0 ? 'نقص' : 'زيادة'} {fmt(Math.abs(diff))})
                              </span>
                            </span>
                          ) : (
                            <div className="pay-req-match">
                              <span className="pay-req-symbol">check_circle</span>
                              <span>مطابق تماماً</span>
                            </div>
                          )}
                        </td>

                        <td data-label="اسم المرسل">
                          <div className="pay-req-sender-name">{item.senderName}</div>
                        </td>

                        <td className="pay-req-td-actions">
                          {pending ? (
                            <div className="pay-req-actions-cell">
                              <button
                                type="button"
                                className="pay-req-btn-confirm"
                                onClick={() => handleConfirm(item)}
                                disabled={busyId === item.ticketId}
                                title="تأكيد الدفع وإصدار باركود التذكرة"
                              >
                                <span className="pay-req-symbol">check</span>
                                <span>{busyId === item.ticketId ? '...' : 'تأكيد'}</span>
                              </button>
                              <button
                                type="button"
                                className={`pay-req-btn-reject ${mismatch ? 'warn' : ''}`}
                                onClick={() => openReject(item)}
                                disabled={busyId === item.ticketId}
                                title="رفض الطلب وإبلاغ الطالب"
                              >
                                <span className="pay-req-symbol">block</span>
                                <span>رفض</span>
                              </button>
                            </div>
                          ) : (
                            <div className="pay-req-actions-cell" style={{ justifyContent: 'center' }}>
                              <span className="pay-req-ticket-chip">
                                {item.status === 'confirmed' ? 'تم التأكيد' : 'تم الرفض'}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="pay-req-empty">ما في طلبات مطابقة</div>
          )}

          <div className="pay-req-table-footer">
            <div>
              عرض {filtered.length} من أصل {mapped.length} طلباً
              {mismatchCount > 0 && (
                <>
                  {' | '}
                  <strong>{mismatchCount} حالة عدم تطابق تحتاج إجراء فوري</strong>
                </>
              )}
            </div>
            <div className="pay-req-pager">
              <button type="button" className="pay-req-page-btn active">1</button>
            </div>
          </div>
        </div>
      </main>

      {/* نافذة رفض الدفع */}
      {rejectTarget && (
        <div
          className="pay-req-modal-overlay"
          role="presentation"
          onClick={() => !rejecting && setRejectTarget(null)}
        >
          <div
            className="pay-req-modal"
            role="dialog"
            aria-modal="true"
            aria-label="سبب رفض الدفع"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="pay-req-modal-title">رفض طلب الدفع</h4>
            <p className="pay-req-modal-sub">
              {rejectTarget.name} — {fmt(rejectTarget.paid)} ل.س
            </p>
            <label className="pay-req-modal-label" htmlFor="reject-reason">
              سبب الرفض (3 - 255 حرفاً)
            </label>
            <textarea
              id="reject-reason"
              className="pay-req-modal-textarea"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="مثال: المبلغ المُدخل لا يطابق السعر المطلوب للباقة"
              maxLength={255}
            />
            {rejectError && <p className="pay-req-modal-error">{rejectError}</p>}
            <div className="pay-req-modal-actions">
              <button
                type="button"
                className="pay-req-modal-cancel"
                onClick={() => setRejectTarget(null)}
                disabled={rejecting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="pay-req-btn-reject warn"
                onClick={submitReject}
                disabled={rejecting}
              >
                {rejecting ? 'جارٍ الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
