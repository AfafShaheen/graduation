import React, { useState, useEffect } from 'react';
import '../../style/AdminDashboard.css';
import AdminSidebar from '../../components/AdminSidebar';

/* ==========================================================================
   بيانات تجريبية: لما يجهز الباك إند بدّلها ببيانات حقيقية (مثلاً عبر props)
   ========================================================================== */
const STATS = {
  confirmedSeats: 4210, // حضور مؤكد (خريجون + مرافقون)
  pendingSeats: 680, // حضور قيد التدقيق
  registeredGrads: 1840,
  totalGrads: 2100,
  confirmedBookings: 1580,
  processing: 142,
  unpaid: 90,
  rejected: 28,
  // إجابات الخريجين عن أسئلة المشاركة في التنظيم
  volunteers: 312, // يرغبون بتولّي مسؤولية في تقديم الحفل
  withExperience: 548, // لديهم خبرة سابقة
  volunteersWithExperience: 187, // يرغبون ولديهم خبرة (الأنسب للتكليف)
  ticketTypes: [
    { label: 'خريج + مرافقان', count: 1120, tone: 'green' },
    { label: 'خريج + ثلاثة مرافقين', count: 460, tone: 'orange' },
  ],
};

const FACULTIES = [
  { name: 'كلية الهندسة الميكانيكية والكهربائية', grads: 480, confirmed: 82, pending: 14 },
  { name: 'كلية الهندسة المدنية', grads: 360, confirmed: 78, pending: 13 },
  { name: 'كلية الطب البشري', grads: 290, confirmed: 90, pending: 8 },
  { name: 'كلية العلوم', grads: 240, confirmed: 68, pending: 14 },
  { name: 'كلية الصيدلة', grads: 210, confirmed: 74, pending: 15 },
];

const RECENT_REVIEWS = [
  { name: 'همام طراد الحصيني', desc: 'هندسة معمارية • مرافقان', status: 'confirmed' },
  { name: 'سدرة أحمد الساعي', desc: 'طب بشري • ثلاثة مرافقين', status: 'review' },
  { name: 'قتيبة مروان العمار', desc: 'تكنولوجيا • ثلاثة مرافقين', status: 'confirmed' },
  { name: 'مهند سامي الإبراهيم', desc: 'صيدلة • رقم العملية مكرر', status: 'rejected' },
];

const STATUS_LABELS = { confirmed: 'مؤكد', review: 'قيد التدقيق', rejected: 'مرفوض' };


/* سجل التدقيق والتوزيع المكاني (عينة): بدّلها لاحقاً ببيانات الصفحة الحالية من الباك إند */
const STUDENTS = [
  {
    id: '2019-108422',
    name: 'وسيم حسام الدين الدرويي',
    faculty: 'الهندسة المدنية',
    major: 'إدارة التشييد',
    companions: 2,
    status: 'confirmed',
  },
  {
    id: '2019-114389',
    name: 'ليان طارق خزام',
    faculty: 'الهندسة المعمارية',
    major: 'التصميم الداخلي',
    companions: 3,
    status: 'review',
  },
  {
    id: '2018-095521',
    name: 'حمزة غسان الأتاسي',
    faculty: 'الهندسة المدنية',
    major: 'هندسة المياه والبيئة',
    companions: 2,
    status: 'confirmed',
  },
  {
    id: '2019-122904',
    name: 'نور عبد الوهاب الجندلي',
    faculty: 'الهندسة المعمارية',
    major: 'تخطيط مدن',
    companions: 2,
    status: 'rejected',
    rejectReason: 'رقم العملية مكرر',
  },
  {
    id: '2018-087114',
    name: 'عمرو بشير العلي',
    faculty: 'الهندسة المدنية',
    major: 'الهندسة الإنشائية',
    companions: 3,
    status: 'confirmed',
  },
];

const PAGE_SIZE = 5;

const PAY_LABELS = { confirmed: 'مؤكدة', review: 'قيد التدقيق', rejected: 'مرفوضة' };
const PAY_ICONS = { confirmed: 'check', review: 'schedule', rejected: 'close' };

/* الأعمدة القابلة للإخفاء (اسم الخريج وعمود الإجراءات ثابتان) */
const OPTIONAL_COLUMNS = [
  { id: 'faculty', label: 'الكلية والتخصص' },
  { id: 'ticket', label: 'فئة التذكرة' },
  { id: 'status', label: 'حالة الدفع' },
  { id: 'reason', label: 'سبب الرفض' },
];

const COMPANIONS_LABEL = { 2: 'خريج + ٢ مرافقان', 3: 'خريج + ٣ مرافقين' };

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

const fmt = (n) => n.toLocaleString('en-US');
const pct = (part, total) => Math.round((part / total) * 100);

export default function AdminDashboard({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onLogout,
  onAddTicket,
  onNavigate,
  onSearch,
  onApplyFilter,
  onExportPdf,
  onExportExcel,
  onPageChange,
  onReviewReceipt,
  onReopenOrder,
  onDownloadTicket,
}) {
  const [selectedFaculty, setSelectedFaculty] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة
  const [page, setPage] = useState(1);
  const [hiddenCols, setHiddenCols] = useState([]); // الأعمدة المخفية بالجدول
  const [colsOpen, setColsOpen] = useState(false);

  // إغلاق القائمة بزر Escape
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

  const expectedTotal = STATS.confirmedSeats + STATS.pendingSeats;
  const responseRate = ((STATS.registeredGrads / STATS.totalGrads) * 100).toFixed(1);

  const totalPages = Math.ceil(STATS.registeredGrads / PAGE_SIZE);
  const showCol = (id) => !hiddenCols.includes(id);
  const toggleCol = (id) =>
    setHiddenCols((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  const goToPage = (n) => {
    if (n < 1 || n > totalPages || n === page) return;
    setPage(n);
    if (onPageChange) onPageChange(n);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (onSearch) onSearch(searchQuery.trim());
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

        <div className="adm-topbar-actions">
          <button aria-label="التنبيهات" className="adm-icon-action-btn" title="التنبيهات" type="button">
            <span className="adm-symbol">notifications</span>
            <span className="adm-notif-dot"></span>
          </button>

          <button aria-label="التقويم" className="adm-icon-action-btn" title="التقويم" type="button">
            <span className="adm-symbol">calendar_today</span>
          </button>

          <button className="adm-help-btn" type="button">
            <span className="adm-symbol" style={{ fontSize: '18px' }}>
              help_outline
            </span>
            <span className="adm-help-text">المساعدة والدعم</span>
          </button>
        </div>

        <form className="adm-search-form" onSubmit={handleSearch} role="search">
          <input
            type="text"
            autoComplete="off"
            className="adm-search-input"
            placeholder="بحث عن اسم أو رقم جامعي..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="adm-symbol adm-search-icon" style={{ fontSize: '18px' }}>
            search
          </span>
        </form>
      </header>

      {/* محتوى اللوحة */}
      <main className="adm-main-canvas">
        {/* الترحيب والفلتر */}
        <section className="adm-hero-row">
          <div className="adm-hero-titles">
            <div className="adm-pulse-tag">
              <span className="adm-mini-dot"></span>
              <span className="adm-pulse-label">حفل دورة 2026</span>
              <span className="adm-pulse-venue">• مدرج الباسل المركزي</span>
            </div>
            <h3>مرحباً زميلنا، إليك ملخص حجوزات الحفل وإحصائياته</h3>
            <p>
              تحديث مباشر لبيانات الدفع، وتدقيق بطاقات الخريجين والمرافقين المعتمدين للدفعة الرابعة والأربعين.
            </p>
          </div>

          <div className="adm-filter-cluster">
            <div className="adm-select-wrapper">
              <span className="adm-symbol" style={{ color: '#124d44' }}>
                filter_alt
              </span>
              <select
                aria-label="تصفية حسب الحفل"
                value={selectedFaculty}
                onChange={(e) => setSelectedFaculty(e.target.value)}
              >
                <option value="all">كل الحفلات</option>
                <option value="arch">حفل كلية الهندسة المعمارية والمدنية</option>
                <option value="med">حفل كلية الطب البشري وطب الأسنان</option>
                <option value="lit">حفل كلية الآداب والعلوم الإنسانية</option>
              </select>
            </div>

            <button
              className="adm-btn-primary"
              type="button"
              onClick={() => onApplyFilter && onApplyFilter(selectedFaculty)}
            >
              تطبيق التصفية
            </button>

            <div className="adm-export-cluster">
              <button className="adm-export-btn" type="button" onClick={onExportPdf}>
                <span className="adm-symbol" style={{ fontSize: '18px' }}>
                  picture_as_pdf
                </span>
                <span>تقرير PDF</span>
              </button>
              <span className="adm-export-sep"></span>
              <button className="adm-export-btn" type="button" onClick={onExportExcel}>
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
              <h4 className="adm-highlight-title">إجمالي الحضور المتوقع في مدرج الباسل</h4>
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
                <div className="adm-pill-value">{fmt(STATS.confirmedSeats)}</div>
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
                <div className="adm-pill-value orange">{fmt(STATS.pendingSeats)}</div>
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
              تدقيق الطلبات المعلقة ({STATS.processing})
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
                <span className="adm-stat-value">{fmt(STATS.registeredGrads)}</span>
                <span className="adm-stat-unit">/ {fmt(STATS.totalGrads)}</span>
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
                <span className="adm-stat-value">{fmt(STATS.confirmedBookings)}</span>
                <span className="adm-stat-unit">تذكرة</span>
              </div>
              <p className="adm-stat-meta">رموز QR جاهزة للطباعة والتسليم بنسبة نجاح 98.2%</p>
            </div>

            {/* قيد المعالجة */}
            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>قيد المعالجة</span>
                <span className="adm-tiny-badge outline">معلقة</span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value orange">{fmt(STATS.processing)}</span>
                <span className="adm-stat-unit">طلباً</span>
              </div>
              <p className="adm-stat-meta">إشعارات شام كاش (متوسط المعالجة: 18 دقيقة)</p>
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
                  <span className="adm-split-number">{fmt(STATS.unpaid)}</span>
                  <span className="adm-split-label">لم يسددوا</span>
                </div>
                <span className="adm-split-sep"></span>
                <div>
                  <span className="adm-split-number red">{fmt(STATS.rejected)}</span>
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
                {STATS.ticketTypes.map((t) => (
                  <div className="adm-ticket-type-row" key={t.label}>
                    <span>{t.label}</span>
                    <strong className={t.tone}>{fmt(t.count)}</strong>
                  </div>
                ))}
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
                <span className="adm-stat-value">{fmt(STATS.volunteers)}</span>
                <span className="adm-stat-unit">خريجاً</span>
              </div>
              <div className="adm-stat-meta between">
                <span>من المسجلين</span>
                <span className="adm-stat-rate">{pct(STATS.volunteers, STATS.registeredGrads)}%</span>
              </div>
              <div className="adm-progress-mini">
                <div style={{ width: `${pct(STATS.volunteers, STATS.registeredGrads)}%` }}></div>
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
                <span className="adm-stat-value">{fmt(STATS.withExperience)}</span>
                <span className="adm-stat-unit">خريجاً</span>
              </div>
              <div className="adm-stat-meta between">
                <span>من المسجلين</span>
                <span className="adm-stat-rate">{pct(STATS.withExperience, STATS.registeredGrads)}%</span>
              </div>
              <div className="adm-progress-mini">
                <div style={{ width: `${pct(STATS.withExperience, STATS.registeredGrads)}%` }}></div>
              </div>
            </div>

            <div className="adm-bento-col">
              <div className="adm-stat-head">
                <span>راغبون ولديهم خبرة</span>
                <span className="adm-tiny-badge solid">الأنسب</span>
              </div>
              <div className="adm-stat-value-row">
                <span className="adm-stat-value orange">{fmt(STATS.volunteersWithExperience)}</span>
                <span className="adm-stat-unit">خريجاً</span>
              </div>
              <p className="adm-stat-meta">
                {pct(STATS.volunteersWithExperience, STATS.volunteers)}% من الراغبين بتولّي مسؤولية لديهم خبرة سابقة
              </p>
            </div>
          </div>
        </section>

        {/* التوزيع حسب الكلية وآخر التدقيقات */}
        <section className="adm-lower-grid">
          <div className="adm-chart-col adm-bento-card">
            <div className="adm-bento-head bordered">
              <div>
                <h4 className="adm-bento-title">التوزيع حسب الكلية ونسبة الحجز</h4>
                <p className="adm-bento-sub">
                  مقارنة الحجوزات المؤكدة وقيد التدقيق لكل كلية
                </p>
              </div>
              <div className="adm-legend">
                <span className="adm-legend-item">
                  <span className="adm-legend-dot green"></span>
                  مؤكد مسدد
                </span>
                <span className="adm-legend-item">
                  <span className="adm-legend-dot orange"></span>
                  قيد التدقيق
                </span>
              </div>
            </div>

            <div className="adm-faculty-list">
              {FACULTIES.map((fac) => (
                <div className="adm-faculty-row" key={fac.name}>
                  <div className="adm-faculty-row-head">
                    <span>{fac.name}</span>
                    <span className="adm-faculty-ratio">
                      {fac.confirmed + fac.pending}% ({fmt(fac.grads)} خريج)
                    </span>
                  </div>
                  <div className="adm-faculty-bar">
                    <div className="adm-seg green" style={{ width: `${fac.confirmed}%` }}></div>
                    <div className="adm-seg orange" style={{ width: `${fac.pending}%` }}></div>
                  </div>
                </div>
              ))}
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
              {RECENT_REVIEWS.map((item) => (
                <div className="adm-verif-item" key={item.name}>
                  <div>
                    <span className="adm-verif-name">{item.name}</span>
                    <span className="adm-verif-desc">{item.desc}</span>
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
              <h4 className="adm-bento-title">سجل التدقيق والتوزيع المكاني للطلبة</h4>
              <p className="adm-bento-sub">
                مراجعة بطاقات الدخول الصادرة وحالة الدفع لكل خريج
              </p>
            </div>

            <div className="adm-table-tools">
              <span className="adm-table-count">
                عرض {STUDENTS.length} من أصل {fmt(STATS.registeredGrads)} خريج
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
                  {showCol('faculty') && <th>الكلية والتخصص</th>}
                  {showCol('ticket') && <th>فئة التذكرة</th>}
                  {showCol('status') && <th>حالة الدفع</th>}
                  {showCol('reason') && <th>سبب الرفض</th>}
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {STUDENTS.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <div className="adm-student-cell">
                        <span className="adm-avatar">{st.name.slice(0, 2)}</span>
                        <div>
                          <span className="adm-student-name">{st.name}</span>
                          <span className="adm-student-id">ID: {st.id}</span>
                        </div>
                      </div>
                    </td>

                    {showCol('faculty') && (
                      <td>
                        <span className="adm-faculty-cell">{st.faculty}</span>
                        <span className="adm-faculty-major">— {st.major}</span>
                      </td>
                    )}

                    {showCol('ticket') && (
                      <td>
                        <span className="adm-ticket-pill">{COMPANIONS_LABEL[st.companions]}</span>
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

                    {showCol('reason') && (
                      <td>
                        {st.status === 'rejected' && st.rejectReason ? (
                          <span className="adm-reject-reason">{st.rejectReason}</span>
                        ) : (
                          <span className="adm-reason-empty">—</span>
                        )}
                      </td>
                    )}

                    <td>
                      <div className="adm-row-actions">
                        {st.status === 'review' && (
                          <button
                            type="button"
                            className="adm-row-btn solid"
                            onClick={() => onReviewReceipt && onReviewReceipt(st)}
                          >
                            مراجعة الإيصال
                          </button>
                        )}
                        {st.status === 'rejected' && (
                          <button
                            type="button"
                            className="adm-row-btn danger"
                            onClick={() => onReopenOrder && onReopenOrder(st)}
                          >
                            إعادة فتح الطلب
                          </button>
                        )}
                        {st.status === 'confirmed' && (
                          <>
                            <button
                              type="button"
                              className="adm-row-icon"
                              aria-label="تنزيل التذكرة"
                              title="تنزيل التذكرة"
                              onClick={() => onDownloadTicket && onDownloadTicket(st)}
                            >
                              <span className="adm-symbol" style={{ fontSize: '18px' }}>
                                download
                              </span>
                            </button>
                            <button
                              type="button"
                              className="adm-row-icon"
                              aria-label="المزيد"
                              title="المزيد"
                            >
                              <span className="adm-symbol" style={{ fontSize: '18px' }}>
                                more_vert
                              </span>
                            </button>
                          </>
                        )}
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
              الصفحة {page} من {fmt(totalPages)} صفحة
            </span>
            <div className="adm-page-btns">
              <button
                type="button"
                className="adm-page-btn wide"
                disabled={page === 1}
                onClick={() => goToPage(page - 1)}
              >
                السابق
              </button>
              {pageItems(page, totalPages).map((n) =>
                typeof n === 'number' ? (
                  <button
                    key={n}
                    type="button"
                    className={`adm-page-btn ${n === page ? 'active' : ''}`}
                    aria-current={n === page ? 'page' : undefined}
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
                disabled={page === totalPages}
                onClick={() => goToPage(page + 1)}
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