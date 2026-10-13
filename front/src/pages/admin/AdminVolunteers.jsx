import React, { useState, useEffect, useMemo } from 'react';
import '../../style/AdminDashboard.css'; // الشريط الجانبي والتخطيط العام للإدارة
import '../../style/AdminVolunteers.css';
import AdminSidebar from '../../components/AdminSidebar';

/* ==========================================================================
   بيانات تجريبية: لما يجهز الباك إند مرّر القائمة الحقيقية عبر الخاصية volunteers
   كل عنصر: { id, fullName, studentId, faculty, phone, wantsResponsibility, hasExperience, registeredAt }
   wantsResponsibility و hasExperience: 'yes' أو 'no'
   ========================================================================== */
const FIRST = ['أحمد', 'محمد', 'علي', 'سارة', 'لينا', 'ريم', 'عمر', 'هبة', 'يوسف', 'دعاء', 'خالد', 'رنا', 'مجد', 'نور', 'سامر', 'ليث', 'هدى', 'طارق', 'ميس', 'باسل'];
const LAST = ['العلي', 'الحسن', 'الخطيب', 'النجار', 'العمر', 'الحمصي', 'الشامي', 'ديب', 'سليمان', 'الأحمد', 'إبراهيم', 'خضر'];
const FACULTY_KEYS = ['it', 'civil', 'med', 'pharm', 'dent', 'mech', 'science', 'arts'];

const MOCK_VOLUNTEERS = Array.from({ length: 42 }, (_, i) => ({
  id: i + 1,
  fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 5 + 3) % LAST.length]}`,
  studentId: String(418000 + i * 37),
  faculty: FACULTY_KEYS[(i * 3) % FACULTY_KEYS.length],
  phone: `09${String((31000000 + i * 1234567) % 100000000).padStart(8, '0')}`,
  wantsResponsibility: i % 5 === 4 ? 'no' : 'yes',
  hasExperience: i % 2 === 0 ? 'yes' : 'no',
  registeredAt: new Date(Date.UTC(2026, 8, 1 + (i % 25), 8 + (i % 10), (i * 7) % 60)).toISOString(),
}));

const FACULTY_LABELS = {
  it: 'الهندسة المعلوماتية',
  civil: 'الهندسة المدنية',
  med: 'الطب البشري',
  pharm: 'الصيدلة',
  dent: 'طب الأسنان',
  mech: 'الهندسة الميكانيكية',
  science: 'العلوم',
  arts: 'الآداب والعلوم الإنسانية',
};

const PAGE_SIZE = 10;

const fmt = (n) => n.toLocaleString('en-US');
const formatDate = (iso) =>
  new Intl.DateTimeFormat('ar-SY-u-nu-latn', { dateStyle: 'medium' }).format(new Date(iso));

function YesNoChip({ value }) {
  const yes = value === 'yes';
  return <span className={`vol-chip ${yes ? 'yes' : 'no'}`}>{yes ? 'نعم' : 'لا'}</span>;
}

export default function AdminVolunteers({
  volunteers = MOCK_VOLUNTEERS,
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onAddTicket,
  onLogout,
  onExportPdf,
  onExportExcel,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [faculty, setFaculty] = useState('all');
  const [responsibility, setResponsibility] = useState('yes'); // افتراضياً: الراغبون بتولّي مسؤولية
  const [experience, setExperience] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // إحصائيات عامة (من كل القائمة، بغض النظر عن التصفية)
  const totals = useMemo(() => {
    const wants = volunteers.filter((v) => v.wantsResponsibility === 'yes');
    return {
      all: volunteers.length,
      wants: wants.length,
      experienced: volunteers.filter((v) => v.hasExperience === 'yes').length,
      both: wants.filter((v) => v.hasExperience === 'yes').length,
    };
  }, [volunteers]);

  // التصفية والترتيب
  const filtered = useMemo(() => {
    const q = query.trim();
    const rows = volunteers.filter((v) => {
      if (faculty !== 'all' && v.faculty !== faculty) return false;
      if (responsibility !== 'all' && v.wantsResponsibility !== responsibility) return false;
      if (experience !== 'all' && v.hasExperience !== experience) return false;
      if (q && !v.fullName.includes(q) && !v.studentId.includes(q) && !v.phone.includes(q)) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sortBy === 'name') return a.fullName.localeCompare(b.fullName, 'ar');
      if (sortBy === 'faculty') {
        return (FACULTY_LABELS[a.faculty] || '').localeCompare(FACULTY_LABELS[b.faculty] || '', 'ar');
      }
      return new Date(b.registeredAt) - new Date(a.registeredAt); // الأحدث أولاً
    });
    return rows;
  }, [volunteers, query, faculty, responsibility, experience, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  // أي تغيير بالتصفية يرجع للصفحة الأولى
  const withReset = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const resetFilters = () => {
    setQuery('');
    setFaculty('all');
    setResponsibility('yes');
    setExperience('all');
    setSortBy('newest');
    setPage(1);
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
            <span className="vol-stat-value">{fmt(totals.all)}</span>
          </div>
          <div className="vol-stat">
            <span className="vol-stat-label">يرغبون بتولّي مسؤولية</span>
            <span className="vol-stat-value green">{fmt(totals.wants)}</span>
          </div>
          <div className="vol-stat">
            <span className="vol-stat-label">لديهم خبرة سابقة</span>
            <span className="vol-stat-value">{fmt(totals.experienced)}</span>
          </div>
          <div className="vol-stat highlight">
            <span className="vol-stat-label">راغبون ولديهم خبرة (الأنسب)</span>
            <span className="vol-stat-value orange">{fmt(totals.both)}</span>
          </div>
        </section>

        {/* التصفية */}
        <section className="vol-filters" aria-label="التصفية">
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
            <select id="vol-faculty" className="vol-input" value={faculty} onChange={withReset(setFaculty)}>
              <option value="all">كل الكليات</option>
              {Object.entries(FACULTY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
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
              <option value="faculty">الكلية</option>
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
              النتائج: <strong>{fmt(filtered.length)}</strong> خريج
            </p>
            <div className="adm-export-cluster">
              <button className="adm-export-btn" type="button" onClick={() => onExportPdf && onExportPdf(filtered)}>
                <span className="adm-symbol" style={{ fontSize: '18px' }}>picture_as_pdf</span>
                <span>PDF</span>
              </button>
              <span className="adm-export-sep"></span>
              <button className="adm-export-btn" type="button" onClick={() => onExportExcel && onExportExcel(filtered)}>
                <span className="adm-symbol" style={{ fontSize: '18px' }}>table_chart</span>
                <span>Excel</span>
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
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
                      <span className="vol-name">{v.fullName}</span>
                      <span className="vol-sub">{v.studentId}</span>
                    </td>
                    <td data-label="الكلية">{FACULTY_LABELS[v.faculty] || '—'}</td>
                    <td data-label="الهاتف">
                      <span className="vol-phone">{v.phone}</span>
                    </td>
                    <td data-label="مسؤولية">
                      <YesNoChip value={v.wantsResponsibility} />
                    </td>
                    <td data-label="خبرة">
                      <YesNoChip value={v.hasExperience} />
                    </td>
                    <td data-label="تاريخ التسجيل">{formatDate(v.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filtered.length > 0 && (
            <div className="vol-pagination">
              <span className="vol-page-info">
                عرض {fmt(start + 1)}–{fmt(Math.min(start + PAGE_SIZE, filtered.length))} من {fmt(filtered.length)}
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