import React, { useState, useEffect, useMemo } from "react";
import "../../style/AdminCeremonies.css";
import AdminSidebar from '../../components/AdminSidebar';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { useAdminStats } from './hooks/useAdminStats.js';

const STATUS_LABELS = {
  open: "مفتوح للتسجيل",
  closed: "مغلق للتسجيل",
  upcoming: "قريباً",
};

const fmt = (n) => n.toLocaleString("en-US");

export default function AdminCeremonies({
  adminName = "مسؤول الاتحاد",
  adminRole = "الاتحاد الوطني لطلبة سورية",
  ceremonies: ceremoniesProp,
  onAddCeremony,
  onEditCeremony,
  onNavigate,
  onLogout,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { events, loading, error } = useAdminEvents({ search: searchQuery });
  const { stats } = useAdminStats();
  const perEvent = stats?.per_event || [];

  const deriveStatus = (item) => {
    const now = new Date();
    const start = item.registration_start ? new Date(item.registration_start) : null;
    const end = item.registration_end ? new Date(item.registration_end) : null;
    if (start && now < start) return "upcoming";
    if (end && now > end) return "closed";
    return "open";
  };

  const ceremonies = useMemo(() => {
    const base = Array.isArray(ceremoniesProp) ? ceremoniesProp : events;
    return base.map((e) => {
      const pe = perEvent.find((p) => (p.scope?.event_id ?? p.event_id) === e.id);
      const status = deriveStatus(e);
      const title = e.name || e.title || "-";
      const dateStr = e.event_date ? new Date(e.event_date + "T00:00:00").toLocaleDateString("ar-SA") : "-";
      const start = e.registration_start ? new Date(e.registration_start) : null;
      const end = e.registration_end ? new Date(e.registration_end) : null;
      const period = start && end ? `${start.toLocaleDateString("ar-SA")} - ${end.toLocaleDateString("ar-SA")}` : "-";
      const faculties = Array.isArray(e.colleges) ? e.colleges.map((c) => c.name) : (e.faculties || []);
      const booked = pe?.tickets?.confirmed ?? pe?.tickets_confirmed ?? 0;
      const totalGrad = pe?.graduates?.expected ?? pe?.graduates_expected ?? 0;
      const location = e.location || "-";
      const form = e.form || null;
      const whatsappLink = e.whatsapp_group_link || e.whatsappLink || "";
      const pricePkg2 = e.price_2_companions ?? e.pricePkg2 ?? "";
      const pricePkg3 = e.price_3_companions ?? e.pricePkg3 ?? "";
      const enablePkg3 = e.is_3companions_enabled ?? e.enablePkg3 ?? true;
      const icon = e.icon || "celebration";
      return { ...e, id: e.id, title, date: dateStr, period, status, faculties, location, form, booked, total: totalGrad, whatsappLink, pricePkg2, pricePkg3, enablePkg3, icon };
    });
  }, [ceremoniesProp, events, perEvent]);

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
      return [c.title, c.id, "", ...c.faculties]
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
          <span>جامعة حمص</span>
        </div>

        <div className="cer-topbar-actions">
          <div className="cer-profile-box">
            <div className="cer-profile-info">
              <span className="cer-profile-name">{adminName}</span>
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
            <h3>إدارة حفلات التخرج وفترات التسجيل</h3>
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
        {loading && <div className="cer-empty">جارٍ تحميل الحفلات...</div>}
        {error && !loading && (
          <div className="cer-empty" role="alert">
            {error.message || error}
          </div>
        )}
        <div className="cer-table-card">
          <div className="cer-table-wrapper">
            <table className="cer-table">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>اسم الحفل</th>
                  <th style={{ width: "18%" }}>التاريخ والموعد</th>
                  <th style={{ width: "18%" }}>فترة التسجيل والدفع</th>
                  <th style={{ width: "18%" }}>الكليات المشمولة</th>
                  <th style={{ width: "8%", textAlign: "center" }}>
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && !loading && !error && (
            <div className="cer-empty">ما في حفلات مطابقة للبحث</div>
          )}
        </div>
      </main>
    </div>
  );
}















