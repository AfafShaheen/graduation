import React, { useState, useEffect, useMemo } from "react";
import "../../style/AdminCeremonies.css";
import AdminSidebar from '../../components/AdminSidebar';

/* ==========================================================================
   بيانات تجريبية: لما يجهز الباك إند بدّلها ببيانات حقيقية (مثلاً عبر props)
   ========================================================================== */
const CEREMONIES = [
  {
    id: "ENG-2024-D44",
    title: "حفل كليات الهندسة — الدفعة 44",
    date: "15 تشرين الأول 2024",
    time: "10:00 صباحاً",
    location: "مدرج الباسل الكبير",
    period: "1 أيلول — 25 أيلول 2024",
    status: "open",
    faculties: [
      "الهندسة المدنية",
      "المعلوماتية",
      "الهندسة المعمارية",
      "+2 كليات",
    ],
    booked: 850,
    total: 900,
    icon: "celebration",
  },
  {
    id: "MED-2024-D42",
    title: "حفل كليات العلوم الطبية والصيدلة",
    date: "18 تشرين الأول 2024",
    time: "11:30 صباحاً",
    location: "مدرج الباسل الكبير",
    period: "5 أيلول — 28 أيلول 2024",
    status: "open",
    faculties: ["الطب البشري", "طب الأسنان", "الصيدلة", "العلوم الصحية"],
    booked: 720,
    total: 800,
    icon: "medical_services",
  },
  {
    id: "ART-2024-D46",
    title: "حفل كليات الآداب والتربية والعلوم",
    date: "22 تشرين الأول 2024",
    time: "09:30 صباحاً",
    location: "مدرج كلية الآداب الأول",
    period: "15 أيلول — 5 تشرين الأول 2024",
    status: "closed",
    faculties: ["الآداب والعلوم الإنسانية", "التربية", "العلوم الأولى"],
    booked: 600,
    total: 600,
    icon: "menu_book",
  },
  {
    id: "LAN-2024-D18",
    title: "حفل المعهد العالي للغات والحاسوب",
    date: "25 تشرين الأول 2024",
    time: "01:00 ظهراً",
    location: "مدرج رضا سعيد للمؤتمرات",
    period: "1 تشرين الأول — 15 تشرين الأول 2024",
    status: "open",
    faculties: ["المعهد العالي للغات", "المعهد التقاني للحاسوب"],
    booked: 210,
    total: 350,
    icon: "terminal",
  },
];

const STATUS_LABELS = {
  open: "مفتوح للتسجيل",
  closed: "مغلق للتسجيل",
  upcoming: "قريباً",
};

const fmt = (n) => n.toLocaleString("en-US");
const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

export default function AdminCeremonies({
  adminName = "مسؤول الاتحاد",
  adminRole = "الاتحاد الوطني لطلبة سورية",
  ceremonies = CEREMONIES,
  onAddCeremony,
  onEditCeremony,
  onViewCeremony,
  onNavigate,
  onLogout,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ceremonies.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.title, c.id, c.location, ...c.faculties]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [ceremonies, searchQuery, statusFilter]);

  return (
    <div className="cer-app-container">
      {/* الخط التزييني العلوي */}
      <div className="cer-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="ceremonies"
        onAddTicket={onAddCeremony}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="cer-topbar">
        <button
          type="button"
          className="cer-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="cer-symbol" style={{ fontSize: "24px" }}>
            menu
          </span>
        </button>

        <div className="cer-topbar-title">
          <h2>إدارة مواعيد وحفلات التخرج</h2>
          <span>جامعة حمص • العام الأكاديمي 2023 - 2024</span>
        </div>

        <div className="cer-topbar-actions">
          <button
            aria-label="التنبيهات"
            className="cer-icon-action-btn"
            title="التنبيهات"
            type="button"
          >
            <span className="cer-symbol">notifications</span>
            <span className="cer-notif-dot"></span>
          </button>

          <button
            aria-label="التقويم"
            className="cer-icon-action-btn"
            title="التقويم"
            type="button"
          >
            <span className="cer-symbol">calendar_today</span>
          </button>

          <button className="cer-help-btn" type="button">
            <span className="cer-symbol" style={{ fontSize: "18px" }}>
              help_outline
            </span>
            <span className="cer-help-text">المساعدة والدعم</span>
          </button>

          <div className="cer-profile-box">
            <div className="cer-profile-info">
              <span className="cer-profile-name">{adminName}</span>
              <span className="cer-profile-role">{adminRole}</span>
            </div>
            <div className="cer-profile-avatar">
              <span className="cer-symbol">person</span>
            </div>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="cer-main-canvas">
        {/* العنوان وزر الإضافة */}
        <section className="cer-hero-row">
          <div className="cer-hero-titles">
            <div className="cer-pulse-tag">
              <span className="cer-mini-dot"></span>
              <span className="cer-pulse-label">الحفلات</span>
              <span className="cer-pulse-venue">
                • {ceremonies.length} حفلات مسجلة
              </span>
            </div>
            <h3>إدارة حفلات التخرج وفترات التسجيل والسعة</h3>
            <p>
              أضف حفلاً جديداً أو عدّل مواعيد التسجيل والكليات المشمولة، وتابع
              نسبة الحجز لكل حفل.
            </p>
          </div>

          <button type="button" className="cer-btn-add" onClick={onAddCeremony}>
            <span className="cer-symbol" style={{ fontSize: "20px" }}>
              add_circle
            </span>
            <span>إضافة حفل جديد</span>
          </button>
        </section>

        {/* البحث والفلتر */}
        <section className="cer-filters-group">
          <div className="cer-search-box">
            <input
              type="text"
              autoComplete="off"
              className="cer-search-input"
              placeholder="ابحث عن اسم الحفل، الكلية، أو المدرج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span
              className="cer-symbol cer-search-icon"
              style={{ fontSize: "18px" }}
            >
              search
            </span>
          </div>

          <div className="cer-select-wrapper">
            <span className="cer-symbol" style={{ color: "#124d44" }}>
              filter_alt
            </span>
            <select
              aria-label="تصفية حسب حالة التسجيل"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">حالة التسجيل: الكل</option>
              <option value="open">مفتوح للتسجيل</option>
              <option value="closed">مغلق</option>
              <option value="upcoming">قريباً</option>
            </select>
          </div>
        </section>

        {/* الحفلات */}
        <div className="cer-table-card">
          <div className="cer-table-wrapper">
            <table className="cer-table">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>اسم الحفل</th>
                  <th style={{ width: "18%" }}>التاريخ والموعد</th>
                  <th style={{ width: "18%" }}>فترة التسجيل والدفع</th>
                  <th style={{ width: "18%" }}>الكليات المشمولة</th>
                  <th style={{ width: "14%" }}>السعة والحجوزات</th>
                  <th style={{ width: "8%", textAlign: "center" }}>
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const percentage = pct(item.booked, item.total);
                  const remaining = Math.max(item.total - item.booked, 0);
                  const full = remaining === 0;

                  return (
                    <tr key={item.id}>
                      <td className="cer-td-name">
                        <div className="cer-name-cell">
                          <div className="cer-name-icon">
                            <span
                              className="cer-symbol"
                              style={{ fontSize: "20px" }}
                            >
                              {item.icon}
                            </span>
                          </div>
                          <div>
                            <div className="cer-name-title">{item.title}</div>
                            <div className="cer-name-code">
                              <span>رمز الفعالية:</span>
                              <strong>{item.id}</strong>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td data-label="التاريخ والموعد">
                        <div className="cer-info-stack">
                          <div className="cer-info-line strong">
                            <span className="cer-symbol">event</span>
                            <span>{item.date}</span>
                          </div>
                          <div className="cer-info-line">
                            <span className="cer-symbol">schedule</span>
                            <span>{item.time}</span>
                          </div>
                          <div className="cer-info-line venue">
                            <span className="cer-symbol">location_on</span>
                            <span>{item.location}</span>
                          </div>
                        </div>
                      </td>

                      <td data-label="فترة التسجيل والدفع">
                        <div className="cer-period">{item.period}</div>
                        <span className={`cer-chip ${item.status}`}>
                          {item.status === "open" && (
                            <span className="cer-chip-dot"></span>
                          )}
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>

                      <td data-label="الكليات المشمولة">
                        <div className="cer-faculty-tags">
                          {item.faculties.map((fac) => (
                            <span className="cer-faculty-tag" key={fac}>
                              {fac}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td data-label="السعة والحجوزات">
                        <div className="cer-capacity">
                          <div className="cer-capacity-head">
                            <span className="cer-capacity-booked">
                              {fmt(item.booked)}
                            </span>
                            <span className="cer-capacity-total">
                              / {fmt(item.total)} مقعد
                            </span>
                          </div>
                          <div
                            className="cer-capacity-bar"
                            role="progressbar"
                            aria-valuenow={percentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className={`cer-capacity-fill ${full ? "full" : ""}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <div className="cer-capacity-foot">
                            <span>النسبة: {percentage}%</span>
                            <span
                              className={`cer-capacity-left ${full ? "done" : ""}`}
                            >
                              {full
                                ? "مكتمل بالكامل"
                                : `متبقي ${fmt(remaining)}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="cer-td-actions">
                        <div className="cer-actions-cell">
                          <button
                            type="button"
                            className="cer-icon-action-btn small"
                            title="تعديل الحفل"
                            aria-label="تعديل الحفل"
                            onClick={() =>
                              onEditCeremony && onEditCeremony(item)
                            }
                          >
                            <span
                              className="cer-symbol"
                              style={{ fontSize: "18px" }}
                            >
                              edit
                            </span>
                          </button>
                          <button
                            type="button"
                            className="cer-icon-action-btn small"
                            title="معاينة التذاكر والمقاعد"
                            aria-label="معاينة التذاكر والمقاعد"
                            onClick={() =>
                              onViewCeremony && onViewCeremony(item)
                            }
                          >
                            <span
                              className="cer-symbol"
                              style={{ fontSize: "18px" }}
                            >
                              visibility
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="cer-empty">ما في حفلات مطابقة للبحث</div>
          )}
        </div>
      </main>
    </div>
  );
}