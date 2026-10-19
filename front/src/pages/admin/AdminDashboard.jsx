import React, { useState, useEffect, useMemo } from 'react';
import '../../style/AdminDashboard.css';
import AdminSidebar from '../../components/AdminSidebar';
import { useAdminStats } from './hooks/useAdminStats.js';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { useAdminVolunteers } from './hooks/useAdminVolunteers.js';
import { fetchRecentPayments } from './hooks/useAdminPayments.js';
import { adminBlob, downloadBlob, ApiError } from '../../api/admin.js';

const STATUS_LABELS = { confirmed: 'مؤكد', review: 'قيد التدقيق', rejected: 'مرفوض' };

const PAY_STATUS_UI = {
  CONFIRMED: 'confirmed',
  PROCESSING: 'review',
  AWAITING_PAYMENT: 'review',
  REJECTED: 'rejected',
};

const PAY_LABELS = { confirmed: 'مؤكدة', review: 'قيد التدقيق', rejected: 'مرفوضة' };
const PAY_ICONS = { confirmed: 'check', review: 'schedule', rejected: 'close' };

const COMPANIONS_LABEL = { TWO_COMPANIONS: 'خريج + ٢ مرافقان', THREE_COMPANIONS: 'خريج + ٣ مرافقين' };

/* الأعمدة القابلة للإخفاء (اسم الخريج وعمود الإجراءات ثابتان) */
const OPTIONAL_COLUMNS = [
  { id: 'faculty', label: 'الكلية' },
  { id: 'ticket', label: 'فئة التذكرة' },
  { id: 'status', label: 'حالة الدفع' },
];

/* أرقام الصفحات: 1 2 3 … الأخيرة */
const pageItems = (current, total) => {
  if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('gap-' + n);
    out.push(n);
  });
  return out;
};

const PAGE_SIZE = 5;

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function AdminDashboard({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onLogout,
  onAddTicket,
  onNavigate,
  onExportPdf,
}) {
  const [eventId, setEventId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hiddenCols, setHiddenCols] = useState([]);
  const [colsOpen, setColsOpen] = useState(false);
  const [payments, setPayments] = useState([]);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        setColsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { events } = useAdminEvents({ limit: 100 });

  // اختيار أول حفل تلقائياً لعرض بيانات الدفع وآخر التدقيقات
  useEffect(() => {
    if (!eventId && events.length > 0) {
      setEventId(String(events[0].id));
    }
  }, [events, eventId]);

  const selectedEvent = useMemo(
    () => events.find((e) => String(e.id) === String(eventId)) || null,
    [events, eventId]
  );

  const { stats, loading, error } = useAdminStats(eventId || null);
  const { data: volData } = useAdminVolunteers({ eventId: eventId || null, limit: 1 });

  useEffect(() => {
    let active = true;
    if (!eventId) {
      setPayments([]);
      return undefined;
    }
    setPayLoading(true);
    setPayError('');
    fetchRecentPayments(eventId, 50)
      .then((res) => {
        if (active) setPayments(res.items || []);
      })
      .catch((e) => {
        if (active) setPayError(e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.');
      })
      .finally(() => {
        if (active) setPayLoading(false);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  const t = stats?.tickets || {};
  const g = stats?.graduates || {};
  const attendance = stats?.expected_attendance || {};
  const ticketTypes = stats?.ticket_types || {};
  const byCollege = stats?.by_college || [];
  const vol = volData?.stats || { all: 0, wants: 0, experienced: 0, both: 0 };

  const expectedTotal = (attendance.confirmed || 0) + (attendance.processing || 0);
  const responseRate = g.expected > 0 ? ((g.registered / g.expected) * 100).toFixed(1) : '0.0';

  // صفوف سجل التدقيق: آخر عمليات الدفع للحفل المحدد
  const reviewRows = useMemo(() => {
    const q = searchQuery.trim();
    return payments
      .map((p) => ({
        ticketId: p.ticket_id,
        name: p.graduate?.full_name || '—',
        uniId: p.graduate?.university_id || '—',
        college: p.graduate?.college_name || '—',
        ticketType: COMPANIONS_LABEL[p.ticket_type] || '—',
        status: PAY_STATUS_UI[p.status] || 'review',
      }))
      .filter((r) => !q || r.name.includes(q) || String(r.uniId).includes(q));
  }, [payments, searchQuery]);

  const recentReviews = reviewRows.slice(0, 4);

  const totalPages = Math.max(1, Math.ceil(reviewRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = reviewRows.slice(pageStart, pageStart + PAGE_SIZE);

  const showCol = (id) => !hiddenCols.includes(id);
  const toggleCol = (id) =>
    setHiddenCols((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const goToPage = (n) => {
    if (n < 1 || n > totalPages || n === currentPage) return;
    setPage(n);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
  };

  const handleExportExcel = async () => {
    setActionError('');
    try {
      const query = eventId ? { event_id: eventId } : {};
      const { blob, filename } = await adminBlob('/api/admin/export', query);
      downloadBlob(blob, filename);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'تعذّر تصدير الملف، حاول لاحقاً.');
    }
  };

  const handleExportPdf = () => {
    if (onExportPdf) onExportPdf();
    else window.print();
  };

  return (
    <div className="adm-app-container">
      {/* الخط التزييني العلوي */}
      <div className="adm-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="dashboard"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onAddTicket={onAddTicket}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="adm-topbar">
        <button
          type="button"
          className="adm-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="adm-symbol" style={{ fontSize: '24px' }}>
            menu
          </span>
        </button>

        <div className="adm-topbar-title">
          <h2>تذاكر حفل التخرج — لوحة الإدارة</h2>
          <span>جامعة حمص • فرع الاتحاد الوطني لطلبة سورية</span>
        </div>

        <form className="adm-search-form" onSubmit={handleSearch} role="search">
          <input
            type="text"
            autoComplete="off"
            className="adm-search-input"
            placeholder="بحث عن اسم أو رقم جامعي..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
          <span className="adm-symbol adm-search-icon" style={{ fontSize: '18px' }}>
            search
          </span>
        </form>
      </header>

      {/* محتوى اللوحة */}
      <main className="adm-main-canvas">
        {loading && (
          <div className="adm-bento-card" role="status">
            <p className="adm-bento-sub">جارٍ تحميل الإحصائيات...</p>
          </div>
        )}
        {error && (
          <div className="adm-bento-card" role="alert">
            <p className="adm-bento-sub" style={{ color: '#b3261e' }}>{error}</p>
          </div>
        )}
        {actionError && (
          <div className="adm-bento-card" role="alert">
            <p className="adm-bento-sub" style={{ color: '#b3261e' }}>{actionError}</p>
          </div>
        )}

        {/* الترحيب والفلتر */}
        <section className="adm-hero-row">
          <div className="adm-hero-titles">
            <div className="adm-pulse-tag">
              <span className="adm-mini-dot"></span>
              <span className="adm-pulse-label">{selectedEvent ? selectedEvent.name : 'كل الحفلات'}</span>
            </div>
            <h3>مرحباً زميلنا، إليك ملخص حجوزات الحفل وإحصائياته</h3>
            <p>
              تحديث مباشر لبيانات الدفع، وتدقيق بطاقات الخريجين والمرافقين المعتمدين.
            </p>
          </div>

          <div className="adm-filter-cluster">
            <div className="adm-select-wrapper">
              <span className="adm-symbol" style={{ color: '#124d44' }}>
                filter_alt
              </span>
              <select
                aria-label="تصفية حسب الحفل"
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">كل الحفلات</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>

            <div className="adm-export-cluster">
              <button className="adm-export-btn" type="button" onClick={handleExportPdf}>
                <span className="adm-symbol" style={{ fontSize: '18px' }}>
                  picture_as_pdf
                </span>
                <span>تقرير PDF</span>
              </button>
              <span className="adm-export-sep"></span>
              <button className="adm-export-btn" type="button" onClick={handleExportExcel}>
                <span className="adm-symbol" style={{ fontSize: '18px' }}>
                  table_chart
                </span>
                <span>Excel</span>
              </button>
            </div>
          </div>
        </section>

        {/* البطاقة الرئيسية: إجمالي الحضور المتوقع */}
        <section className="adm-highlight-card">
          <div className="adm-card-grid">
            <div className="adm-highlight-text">
              <div className="adm-tag-pill">
                <span className="adm-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>
                  confirmation_number
                </span>
                <span>القيد الرقمي للحضور</span>
              </div>
              <h4 className="adm-highlight-title">إجمالي الحضور المتوقع</h4>
              <p className="adm-highlight-desc">
                يشمل جميع الخريجين المسجلين حضورياً، إضافة إلى ذويهم والمرافقين المعتمدين وفق بطاقات الدخول الصادرة رسمياً.
              </p>
              <div className="adm-big-number-row">
                <span className="adm-big-number">{fmt(expectedTotal)}</span>
                <span className="adm-big-number-unit">شخصاً (خريجون + مرافقون)</span>
              </div>
            </div>

            <div className="adm-metric-pills">
              <div className="adm-pill-box dark">
                <div className="adm-pill-head">
                  <span className="adm-pill-label">الحضور المؤكد</span>
                  <span className="adm-pill-icon">
                    <span className="adm-symbol" style={{ color: '#b5eee2', fontSize: '18px' }}>
                      verified
                    </span>
                  </span>
                </div>
                <div className="adm-pill-value">{fmt(attendance.confirmed)}</div>
                <div className="adm-pill-note">
                  <span className="adm-symbol" style={{ fontSize: '14px' }}>
                    check_circle
                  </span>
                  <span>تذاكر مسددة ومُصدرة</span>
                </div>
              </div>

              <div className="adm-pill-box light">
                <div className="adm-pill-head">
                  <span className="adm-pill-label orange">قيد المعالجة والتدقيق</span>
                  <span className="adm-pill-icon orange">
                    <span className="adm-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>
                      pending
                    </span>
                  </span>
                </div>
                <div className="adm-pill-value orange">{fmt(attendance.processing)}</div>
                <div className="adm-pill-note muted">
                  <span className="adm-symbol" style={{ fontSize: '14px' }}>
                    hourglass_top
                  </span>
                  <span>بانتظار التحقق من إشعار الدفع</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* مؤشرات التسجيل */}
        <section className="adm-bento-card">
          <div className="adm-bento-head">
            <div>
              <h4 className="adm-bento-title">مؤشرات التسجيل وحالات البطاقات</h4>
              <p className="adm-bento-sub">
                ملخص تفصيلي لحالة التدقيق والدفع الإلكتروني وتوزيع فئات التذاكر المعتمدة
              </p>
            </div>
            <button className="adm-btn-primary orange" type="button" onClick={() => onNavigate && onNavigate('payments')}>
              تدقيق الطلبات المعلقة ({fmt(t.processing)})
            </button>
          </div>

          <div className="adm-bento-grid">
            {/* الخريجون المسجلون */}
            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>الخريجون المسجلون</span>
                <span className="adm-symbol" style={{ color: '#124d44', fontSize: '18px' }}>
                  how_to_reg
                </span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value">{fmt(g.registered)}</span>
                <span className="adm-stat-unit">/ {fmt(g.expected)}</span>
              </div>
              <div className="adm-stat-meta between">
                <span>نسبة الاستجابة</span>
                <span className="adm-stat-rate">{responseRate}%</span>
              </div>
              <div className="adm-progress-mini">
                <div style={{ width: `${responseRate}%` }}></div>
              </div>
            </div>

            {/* الحجوزات المؤكدة */}
            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>الحجوزات المؤكدة</span>
                <span className="adm-tiny-badge solid">معتمدة</span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value">{fmt(t.confirmed)}</span>
                <span className="adm-stat-unit">تذكرة</span>
              </div>
              <p className="adm-stat-meta">رموز QR جاهزة للطباعة والتسليم</p>
            </div>

            {/* قيد المعالجة */}
            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>قيد المعالجة</span>
                <span className="adm-tiny-badge outline">معلقة</span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value orange">{fmt(t.processing)}</span>
                <span className="adm-stat-unit">طلباً</span>
              </div>
              <p className="adm-stat-meta">إشعارات شام كاش بانتظار المراجعة</p>
            </div>

            {/* لم يسددوا / مرفوض */}
            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>بانتظار السداد / مرفوض</span>
                <span className="adm-symbol" style={{ color: '#8d7166', fontSize: '18px' }}>
                  payments
                </span>
              </div>
              <div className="adm-split-stats">
                <div>
                  <span className="adm-split-number">{fmt(t.not_paid_yet)}</span>
                  <span className="adm-split-label">لم يسددوا</span>
                </div>
                <span className="adm-split-sep"></span>
                <div>
                  <span className="adm-split-number red">{fmt(t.rejected)}</span>
                  <span className="adm-split-label">مرفوض</span>
                </div>
              </div>
              <p className="adm-stat-meta">مهلة السداد 48 ساعة • تم إشعار المرفوضين</p>
            </div>

            {/* فئات التذاكر */}
            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>فئات التذاكر المحجوزة</span>
                <span className="adm-symbol" style={{ color: '#124d44', fontSize: '18px' }}>
                  loyalty
                </span>
              </div>
              <div className="adm-ticket-types">
                <div className="adm-ticket-type-row">
                  <span>خريج + مرافقان</span>
                  <strong className="green">{fmt(ticketTypes.TWO_COMPANIONS?.total)}</strong>
                </div>
                <div className="adm-ticket-type-row">
                  <span>خريج + ثلاثة مرافقين</span>
                  <strong className="orange">{fmt(ticketTypes.THREE_COMPANIONS?.total)}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* مشاركة الخريجين في التنظيم */}
        <section className="adm-bento-card">
          <div className="adm-bento-head">
            <div>
              <h4 className="adm-bento-title">مشاركة الخريجين في تقديم الحفل وتنظيمه</h4>
              <p className="adm-bento-sub">
                إجابات الخريجين عن سؤالَي الرغبة في تولّي مسؤولية والخبرة السابقة عند التسجيل
              </p>
            </div>
            <button className="adm-btn-primary" type="button" onClick={() => onNavigate && onNavigate('volunteers')}>
              عرض القائمة
            </button>
          </div>

          <div className="adm-bento-grid three">
            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>يرغبون بتولّي مسؤولية</span>
                <span className="adm-symbol" style={{ color: '#124d44', fontSize: '18px' }}>
                  volunteer_activism
                </span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value">{fmt(vol.wants)}</span>
                <span className="adm-stat-unit">خريجاً</span>
              </div>
              <div className="adm-stat-meta between">
                <span>من المسجلين</span>
                <span className="adm-stat-rate">{pct(vol.wants, vol.all)}%</span>
              </div>
              <div className="adm-progress-mini">
                <div style={{ width: `${pct(vol.wants, vol.all)}%` }}></div>
              </div>
            </div>

            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>لديهم خبرة سابقة</span>
                <span className="adm-symbol" style={{ color: '#124d44', fontSize: '18px' }}>
                  workspace_premium
                </span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value">{fmt(vol.experienced)}</span>
                <span className="adm-stat-unit">خريجاً</span>
              </div>
              <div className="adm-stat-meta between">
                <span>من المسجلين</span>
                <span className="adm-stat-rate">{pct(vol.experienced, vol.all)}%</span>
              </div>
              <div className="adm-progress-mini">
                <div style={{ width: `${pct(vol.experienced, vol.all)}%` }}></div>
              </div>
            </div>

            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>راغبون ولديهم خبرة</span>
                <span className="adm-tiny-badge solid">الأنسب</span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value orange">{fmt(vol.both)}</span>
                <span className="adm-stat-unit">خريجاً</span>
              </div>
              <p className="adm-stat-meta">
                {pct(vol.both, vol.wants)}% من الراغبين بتولّي مسؤولية لديهم خبرة سابقة
              </p>
            </div>
          </div>
        </section>

        {/* التوزيع حسب الكلية وآخر التدقيقات */}
        <section className="adm-lower-grid">
          <div className="adm-chart-col adm-bento-card">
            <div className="adm-bento-head bordered">
              <div>
                <h4 className="adm-bento-title">التوزيع حسب الكلية ونسبة التأكيد</h4>
                <p className="adm-bento-sub">
                  نسبة الحجوزات المؤكدة من إجمالي الخريجين المتوقعين لكل كلية
                </p>
              </div>
              <div className="adm-legend">
                <span className="adm-legend-item">
                  <span className="adm-legend-dot green"></span>
                  مؤكد مسدد
                </span>
              </div>
            </div>

            <div className="adm-faculty-list">
              {byCollege.length === 0 && (
                <p className="adm-bento-sub">لا توجد بيانات كليات لعرضها.</p>
              )}
              {byCollege.map((fac) => {
                const cpct = pct(fac.tickets_confirmed, fac.expected);
                return (
                  <div className="adm-faculty-row" key={fac.college_id}>
                    <div className="adm-faculty-row-head">
                      <span>{fac.college_name}</span>
                      <span className="adm-faculty-ratio">
                        {cpct}% ({fmt(fac.registered)} / {fmt(fac.expected)})
                      </span>
                    </div>
                    <div className="adm-faculty-bar">
                      <div className="adm-seg green" style={{ width: `${cpct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="adm-verif-col adm-bento-card">
            <div className="adm-bento-head bordered">
              <div>
                <h4 className="adm-bento-title small">آخر تدقيقات الدفع</h4>
                <p className="adm-bento-sub small">عمليات التحقق المسجلة حديثاً من الاتحاد الوطني</p>
              </div>
              <span className="adm-symbol" style={{ color: '#ca4b00' }}>
                history
              </span>
            </div>

            <div className="adm-verif-list">
              {recentReviews.length === 0 && (
                <p className="adm-bento-sub small">
                  {payLoading ? 'جارٍ التحميل...' : payError || 'لا توجد عمليات حديثة.'}
                </p>
              )}
              {recentReviews.map((item) => (
                <div className="adm-verif-item" key={item.ticketId}>
                  <div>
                    <span className="adm-verif-name">{item.name}</span>
                    <span className="adm-verif-desc">{item.college} • {item.ticketType}</span>
                  </div>
                  <span className={`adm-chip ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="adm-btn-primary outline full"
              onClick={() => onNavigate && onNavigate('payments')}
            >
              سجل التدقيقات الكامل
            </button>
          </div>
        </section>

        {/* سجل تدقيق الطلبة */}
        <section className="adm-bento-card adm-table-card">
          <div className="adm-table-head">
            <div>
              <h4 className="adm-bento-title">سجل التدقيق للخريجين</h4>
              <p className="adm-bento-sub">
                مراجعة بطاقات الدخول الصادرة وحالة الدفع لكل خريج
              </p>
            </div>

            <div className="adm-table-tools">
              <span className="adm-table-count">
                عرض {fmt(pageRows.length)} من أصل {fmt(reviewRows.length)} خريج
              </span>
              <div className="adm-cols-wrap">
                <button
                  type="button"
                  className="adm-btn-primary outline adm-cols-btn"
                  aria-expanded={colsOpen}
                  onClick={() => setColsOpen((o) => !o)}
                >
                  <span className="adm-symbol" style={{ fontSize: '18px' }}>
                    view_column
                  </span>
                  <span>تخصيص الأعمدة</span>
                </button>
                {colsOpen && (
                  <div className="adm-cols-menu" role="menu">
                    {OPTIONAL_COLUMNS.map((c) => (
                      <label key={c.id} className="adm-cols-item">
                        <input
                          type="checkbox"
                          checked={showCol(c.id)}
                          onChange={() => toggleCol(c.id)}
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="adm-table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>اسم الخريج والرقم الجامعي</th>
                  {showCol('faculty') && <th>الكلية</th>}
                  {showCol('ticket') && <th>فئة التذكرة</th>}
                  {showCol('status') && <th>حالة الدفع</th>}
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <span className="adm-reason-empty">
                        {payLoading ? 'جارٍ تحميل البيانات...' : payError || 'لا توجد بيانات لعرضها.'}
                      </span>
                    </td>
                  </tr>
                )}
                {pageRows.map((st) => (
                  <tr key={st.ticketId}>
                    <td>
                      <div className="adm-student-cell">
                        <span className="adm-avatar">{st.name.slice(0, 2)}</span>
                        <div>
                          <span className="adm-student-name">{st.name}</span>
                          <span className="adm-student-id">ID: {st.uniId}</span>
                        </div>
                      </div>
                    </td>

                    {showCol('faculty') && (
                      <td>
                        <span className="adm-faculty-cell">{st.college}</span>
                      </td>
                    )}

                    {showCol('ticket') && (
                      <td>
                        <span className="adm-ticket-pill">{st.ticketType}</span>
                      </td>
                    )}

                    {showCol('status') && (
                      <td>
                        <span className={`adm-chip adm-chip-icon ${st.status}`}>
                          <span className="adm-symbol" style={{ fontSize: '14px' }}>
                            {PAY_ICONS[st.status]}
                          </span>
                          {PAY_LABELS[st.status]}
                        </span>
                      </td>
                    )}

                    <td>
                      <div className="adm-row-actions">
                        <button
                          type="button"
                          className="adm-row-btn solid"
                          onClick={() => onNavigate && onNavigate('payments')}
                        >
                          عرض الطلب
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* التنقل بين الصفحات */}
          <div className="adm-pagination">
            <span className="adm-page-info">
              الصفحة {currentPage} من {fmt(totalPages)} صفحة
            </span>
            <div className="adm-page-btns">
              <button
                type="button"
                className="adm-page-btn wide"
                disabled={currentPage === 1}
                onClick={() => goToPage(currentPage - 1)}
              >
                السابق
              </button>
              {pageItems(currentPage, totalPages).map((n) =>
                typeof n === 'number' ? (
                  <button
                    key={n}
                    type="button"
                    className={`adm-page-btn ${n === currentPage ? 'active' : ''}`}
                    aria-current={n === currentPage ? 'page' : undefined}
                    onClick={() => goToPage(n)}
                  >
                    {n}
                  </button>
                ) : (
                  <span key={n} className="adm-page-gap">
                    …
                  </span>
                )
              )}
              <button
                type="button"
                className="adm-page-btn wide"
                disabled={currentPage === totalPages}
                onClick={() => goToPage(currentPage + 1)}
              >
                التالي
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
