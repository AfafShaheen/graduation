import React, { useState, useEffect } from 'react';
import '../../style/AdminDashboard.css';
import '../../style/AdminStats.css';
import AdminSidebar from '../../components/AdminSidebar';
import StatsView from './stats/StatsView.jsx';
import { useAdminStatsV2 } from './hooks/useAdminStatsV2.js';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { adminBlob, downloadBlob, ApiError } from '../../api/admin.js';

const clock = (date) =>
  date
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Damascus',
      }).format(date)
    : '';

// Statistics page. The filter at the top (one ceremony or all of them) applies to every
// number on the page; the numbers refresh by themselves and open the matching list.
export default function AdminDashboard({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onLogout,
  onNavigate,
}) {
  const [eventId, setEventId] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { events } = useAdminEvents({ limit: 100 });

  const { data, loading, refreshing, error, updatedAt, refresh } = useAdminStatsV2(eventId || null);
  // never show the numbers of the previous filter while the new ones load
  const ready = Boolean(data) && String(data.scope.event_id ?? '') === String(eventId);

  const handleExportExcel = async () => {
    setExportError('');
    setExportBusy(true);
    try {
      const query = eventId ? { event_id: eventId } : {};
      const { blob, filename } = await adminBlob('/api/admin/export', query);
      downloadBlob(blob, filename);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'تعذّر تصدير الملف، حاول لاحقاً.');
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="adm-app-container">
      <div className="adm-top-accent"></div>

      <AdminSidebar
        activeId="dashboard"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      <header className="adm-topbar">
        <button type="button" className="adm-menu-btn" aria-label="فتح القائمة" onClick={() => setNavOpen(true)}>
          <span className="adm-symbol" style={{ fontSize: '24px' }}>
            menu
          </span>
        </button>
        <div className="adm-topbar-title">
          <h2>تذاكر حفل التخرج — لوحة الإدارة</h2>
          <span>جامعة حمص</span>
        </div>
      </header>

      <main className="adm-main-canvas">
        <section className="st2-toolbar">
          <div className="st2-toolbar-titles">
            <h3>إحصائيات الحفلات</h3>
            <p>
              اختر حفلاً أو «كل الحفلات»: الفلتر يشمل كل ما في الصفحة. اضغط على أي رقم لتشاهد أصحابه في صفحة
              الخريجين.
            </p>
          </div>
          <div className="st2-toolbar-actions">
            <div className="adm-select-wrapper">
              <span className="adm-symbol" style={{ color: '#124d44' }}>
                filter_alt
              </span>
              <select aria-label="تصفية حسب الحفل" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">كل الحفلات</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="st2-refresh" onClick={refresh} disabled={refreshing}>
              <span className={`adm-symbol ${refreshing ? 'st2-spin' : ''}`} style={{ fontSize: '18px' }}>
                refresh
              </span>
              <span>تحديث</span>
            </button>
            <span className="st2-muted" aria-live="polite">
              {updatedAt ? `آخر تحديث ${clock(updatedAt)}` : ''}
            </span>
            <button
              className="adm-export-btn"
              type="button"
              onClick={handleExportExcel}
              disabled={exportBusy}
              title="تنزيل تقرير الخريجين مع حالة التذكرة والدفع"
            >
              <span className="adm-symbol" style={{ fontSize: '18px' }}>
                table_chart
              </span>
              <span>{exportBusy ? 'جارٍ التصدير...' : 'Excel'}</span>
            </button>
          </div>
        </section>
        {exportError && (
          <p className="st2-error" role="alert">
            {exportError}
          </p>
        )}

        {!ready && loading && (
          <div className="st2-card st2-state" role="status">
            <p>جارٍ تحميل الإحصائيات...</p>
          </div>
        )}
        {!ready && !loading && error && (
          <div className="st2-card st2-state" role="alert">
            <p className="st2-error">{error}</p>
            <button type="button" className="st2-refresh" onClick={refresh}>
              إعادة المحاولة
            </button>
          </div>
        )}
        {ready && (
          <>
            {error && (
              <p className="st2-error" role="alert">
                {error}
              </p>
            )}
            <StatsView data={data} onGo={(section) => onNavigate && onNavigate(section)} />
          </>
        )}
      </main>
    </div>
  );
}
