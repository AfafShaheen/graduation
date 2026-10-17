import React, { useState, useEffect, useMemo } from 'react';
import '../../style/AdminDashboard.css'; // الشريط الجانبي والتخطيط العام للإدارة
import '../../style/AdminVolunteers.css';
import AdminSidebar from '../../components/AdminSidebar';
import { useAdminVolunteers, exportVolunteers } from './hooks/useAdminVolunteers.js';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { adminRequest, ApiError } from '../../api/admin.js';

const PAGE_SIZE = 10;

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('ar-SY', {
        timeZone: 'Asia/Damascus',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '—';

const PAGE_EXPORT_SIZE = 200; // same upper bound the API allows (limit <= 200)

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildVolunteersPrintHtml = (volunteers) => {
  const rows = volunteers
    .map(
      (v) => `
      <tr>
        <td>${escapeHtml(v.full_name)}</td>
        <td>${escapeHtml(v.university_id)}</td>
        <td>${escapeHtml(v.college_name || '—')}</td>
        <td>${escapeHtml(v.phone || '—')}</td>
        <td>${v.wants_responsibility === 'yes' ? 'نعم' : 'لا'}</td>
        <td>${v.has_experience === 'yes' ? 'نعم' : 'لا'}</td>
        <td>${escapeHtml(formatDate(v.registered_at))}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>قائمة المتطوعين</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color: #1f2937; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #6b7280; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: right; }
  thead th { background: #f3f4f6; }
  tbody tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
  <h1>قائمة المتطوعين</h1>
  <p class="meta">عدد النتائج: ${volunteers.length}</p>
  <table>
    <thead>
      <tr>
        <th>الاسم الكامل</th>
        <th>الرقم الجامعي</th>
        <th>الكلية</th>
        <th>الهاتف</th>
        <th>يرغب بمسؤولية</th>
        <th>الخبرة السابقة</th>
        <th>تاريخ التسجيل</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
};

function YesNoChip({ value }) {
  const yes = value === 'yes';
  return <span className={`vol-chip ${yes ? 'yes' : 'no'}`}>{yes ? 'نعم' : 'لا'}</span>;
}

export default function AdminVolunteers({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onAddTicket,
  onLogout,
  onExportPdf,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [eventId, setEventId] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [collegeId, setCollegeId] = useState('all');
  const [responsibility, setResponsibility] = useState('yes'); // افتراضياً: الراغبون بتولّي مسؤولية
  const [experience, setExperience] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // تأخير بسيط على البحث لتقليل طلبات الخادم
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { events } = useAdminEvents({ limit: 100 });
  const selectedEvent = useMemo(
    () => events.find((e) => String(e.id) === String(eventId)) || null,
    [events, eventId]
  );
  const colleges = selectedEvent?.colleges || [];

  const offset = (page - 1) * PAGE_SIZE;
  const { data, loading, error } = useAdminVolunteers({
    eventId: eventId || null,
    collegeId: collegeId === 'all' ? '' : collegeId,
    q: debouncedQuery.trim(),
    wants: responsibility === 'all' ? '' : responsibility,
    hasExp: experience === 'all' ? '' : experience,
    sort: sortBy,
    limit: PAGE_SIZE,
    offset,
  });

  const stats = data?.stats || { all: 0, wants: 0, experienced: 0, both: 0 };
  const total = data?.total || 0;
  const rows = data?.items || [];

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;

  // أي تغيير بالتصفية يرجع للصفحة الأولى
  const withReset = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const onEventChange = (e) => {
    setEventId(e.target.value);
    setCollegeId('all');
    setPage(1);
  };

  const resetFilters = () => {
    setQuery('');
    setDebouncedQuery('');
    setCollegeId('all');
    setResponsibility('yes');
    setExperience('all');
    setSortBy('newest');
    setPage(1);
  };

  const buildVolunteerFilters = () => {
    const filters = { sort: sortBy };
    if (eventId) filters.event_id = eventId;
    const college = collegeId === 'all' ? '' : collegeId;
    if (college) filters.college_id = college;
    if (debouncedQuery.trim()) filters.q = debouncedQuery.trim();
    if (responsibility !== 'all') filters.wants_responsibility = responsibility;
    if (experience !== 'all') filters.has_experience = experience;
    return filters;
  };

  // PDF export must cover every row matching the current filters, not just the
  // visible page, so we page through the API (limit is capped at 200 per request).
  const fetchAllFilteredVolunteers = async () => {
    const base = buildVolunteerFilters();
    const collected = [];
    let offset = 0;
    for (;;) {
      const res = await adminRequest('/api/admin/volunteers', {
        query: { ...base, limit: PAGE_EXPORT_SIZE, offset },
      });
      const items = res?.items || [];
      collected.push(...items);
      const total = res?.total || collected.length;
      offset += PAGE_EXPORT_SIZE;
      if (items.length === 0 || collected.length >= total) break;
    }
    return collected;
  };

  const handleExportPdf = async () => {
    if (pdfBusy) return;
    setExportError('');
    setPdfBusy(true);
    try {
      const all = await fetchAllFilteredVolunteers();
      if (onExportPdf) {
        onExportPdf(all);
        return;
      }
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setExportError('تعذّر فتح نافذة الطباعة، يرجى السماح بالنوافذ المنبثقة.');
        return;
      }
      printWindow.document.write(buildVolunteersPrintHtml(all));
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'تعذّر تصدير الملف، حاول لاحقاً.');
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportExcel = async () => {
    setExportError('');
    try {
      await exportVolunteers({
        eventId: eventId || null,
        collegeId: collegeId === 'all' ? '' : collegeId,
        q: debouncedQuery.trim(),
        wants: responsibility === 'all' ? '' : responsibility,
        hasExp: experience === 'all' ? '' : experience,
        sort: sortBy,
      });
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'تعذّر تصدير الملف، حاول لاحقاً.');
    }
  };

  return (
    <div className="adm-app-container">
      <div className="adm-top-accent"></div>
      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="dashboard"
        currentId="volunteers"
        onAddTicket={onAddTicket}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="adm-topbar">
        <button type="button" className="adm-menu-btn" aria-label="فتح القائمة" onClick={() => setNavOpen(true)}>
          <span className="adm-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="adm-topbar-title">
          <h2>الخريجون الراغبون بتولّي مسؤولية</h2>
          <span>جامعة حمص • فرع الاتحاد الوطني لطلبة سورية</span>
        </div>

        <button type="button" className="vol-back-btn" onClick={() => onNavigate && onNavigate('dashboard')}>
          <span className="adm-symbol" style={{ fontSize: '18px' }}>arrow_forward</span>
          <span className="vol-back-text">العودة إلى لوحة الإحصائيات</span>
        </button>
      </header>

      {/* المحتوى */}
      <main className="adm-main-canvas">
        {/* ملخص سريع */}
        <section className="vol-summary-grid" aria-label="ملخص">
          <div className="vol-stat">
            <span className="vol-stat-label">إجمالي المسجلين</span>
            <span className="vol-stat-value">{fmt(stats.all)}</span>
          </div>
          <div className="vol-stat">
            <span className="vol-stat-label">يرغبون بتولّي مسؤولية</span>
            <span className="vol-stat-value green">{fmt(stats.wants)}</span>
          </div>
          <div className="vol-stat">
            <span className="vol-stat-label">لديهم خبرة سابقة</span>
            <span className="vol-stat-value">{fmt(stats.experienced)}</span>
          </div>
          <div className="vol-stat highlight">
            <span className="vol-stat-label">راغبون ولديهم خبرة (الأنسب)</span>
            <span className="vol-stat-value orange">{fmt(stats.both)}</span>
          </div>
        </section>

        {/* التصفية */}
        <section className="vol-filters" aria-label="التصفية">
          <div className="vol-field">
            <label htmlFor="vol-ceremony">الحفل</label>
            <select id="vol-ceremony" className="vol-input" value={eventId} onChange={onEventChange}>
              <option value="">كل الحفلات</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div className="vol-field vol-field-search">
            <label htmlFor="vol-search">بحث</label>
            <div className="vol-search-wrap">
              <input
                id="vol-search"
                type="text"
                autoComplete="off"
                className="vol-input"
                placeholder="الاسم أو الرقم الجامعي أو الهاتف..."
                value={query}
                onChange={withReset(setQuery)}
              />
              <span className="adm-symbol vol-search-icon" style={{ fontSize: '18px' }}>search</span>
            </div>
          </div>

          <div className="vol-field">
            <label htmlFor="vol-faculty">الكلية</label>
            <select
              id="vol-faculty"
              className="vol-input"
              value={collegeId}
              onChange={withReset(setCollegeId)}
              disabled={!eventId || colleges.length === 0}
            >
              <option value="all">كل الكليات</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="vol-field">
            <label htmlFor="vol-resp">الرغبة بمسؤولية</label>
            <select id="vol-resp" className="vol-input" value={responsibility} onChange={withReset(setResponsibility)}>
              <option value="all">الكل</option>
              <option value="yes">نعم</option>
              <option value="no">لا</option>
            </select>
          </div>

          <div className="vol-field">
            <label htmlFor="vol-exp">الخبرة السابقة</label>
            <select id="vol-exp" className="vol-input" value={experience} onChange={withReset(setExperience)}>
              <option value="all">الكل</option>
              <option value="yes">لديه خبرة</option>
              <option value="no">بدون خبرة</option>
            </select>
          </div>

          <div className="vol-field">
            <label htmlFor="vol-sort">الترتيب</label>
            <select id="vol-sort" className="vol-input" value={sortBy} onChange={withReset(setSortBy)}>
              <option value="newest">الأحدث تسجيلاً</option>
              <option value="name">الاسم</option>
              <option value="college">الكلية</option>
            </select>
          </div>

          <button type="button" className="vol-reset-btn" onClick={resetFilters}>
            <span className="adm-symbol" style={{ fontSize: '18px' }}>restart_alt</span>
            <span>إعادة الضبط</span>
          </button>
        </section>

        {/* القائمة */}
        <section className="vol-list-card">
          <div className="vol-list-head">
            <p className="vol-count">
              النتائج: <strong>{fmt(total)}</strong> خريج
            </p>
            <div className="adm-export-cluster">
              <button className="adm-export-btn" type="button" onClick={handleExportPdf} disabled={pdfBusy}>
                <span className="adm-symbol" style={{ fontSize: '18px' }}>picture_as_pdf</span>
                <span>PDF</span>
              </button>
              <span className="adm-export-sep"></span>
              <button className="adm-export-btn" type="button" onClick={handleExportExcel}>
                <span className="adm-symbol" style={{ fontSize: '18px' }}>table_chart</span>
                <span>Excel</span>
              </button>
            </div>
          </div>

          {exportError && (
            <div className="vol-empty" role="alert" style={{ color: '#b3261e' }}>
              <p>{exportError}</p>
            </div>
          )}

          {error && (
            <div className="vol-empty" role="alert" style={{ color: '#b3261e' }}>
              <p>{error}</p>
            </div>
          )}

          {loading && !error ? (
            <div className="vol-empty">
              <p>جارٍ تحميل البيانات...</p>
            </div>
          ) : !error && rows.length === 0 ? (
            <div className="vol-empty">
              <span className="adm-symbol" style={{ fontSize: '40px', color: '#e2bfb2' }}>person_search</span>
              <p>لا توجد نتائج مطابقة للتصفية الحالية</p>
              <button type="button" className="adm-btn-primary outline" onClick={resetFilters}>
                إعادة ضبط التصفية
              </button>
            </div>
          ) : (
            <table className="vol-table">
              <thead>
                <tr>
                  <th>الخريج</th>
                  <th>الكلية</th>
                  <th>الهاتف</th>
                  <th>مسؤولية</th>
                  <th>خبرة</th>
                  <th>تاريخ التسجيل</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td data-label="الخريج">
                      <span className="vol-name">{v.full_name}</span>
                      <span className="vol-sub">{v.university_id}</span>
                    </td>
                    <td data-label="الكلية">{v.college_name || '—'}</td>
                    <td data-label="الهاتف">
                      <span className="vol-phone">{v.phone || '—'}</span>
                    </td>
                    <td data-label="مسؤولية">
                      <YesNoChip value={v.wants_responsibility} />
                    </td>
                    <td data-label="خبرة">
                      <YesNoChip value={v.has_experience} />
                    </td>
                    <td data-label="تاريخ التسجيل">{formatDate(v.registered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {total > 0 && (
            <div className="vol-pagination">
              <span className="vol-page-info">
                عرض {fmt(start + 1)}–{fmt(Math.min(start + PAGE_SIZE, total))} من {fmt(total)}
              </span>
              <div className="vol-page-buttons">
                <button
                  type="button"
                  className="vol-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <span className="adm-symbol" style={{ fontSize: '18px' }}>chevron_right</span>
                  <span>السابق</span>
                </button>
                <span className="vol-page-current">
                  {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  className="vol-page-btn"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <span>التالي</span>
                  <span className="adm-symbol" style={{ fontSize: '18px' }}>chevron_left</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
