import React from 'react';
import '../style/AdminSidebar.css';
import unionLogo from '../assets/only-logo.png';
import { useAdminStats } from '../context/AdminStatsContext';

/* عناصر القائمة: id هو اسم القسم اللي بيوصل لـ onNavigate (مثلاً /admin/payments) */
const NAV_ITEMS = [
  { id: 'dashboard', icon: 'dashboard', label: 'لوحة الإحصائيات' },
  { id: 'ceremonies', icon: 'school', label: 'الحفلات' },
  { id: 'payments', icon: 'receipt_long', label: 'طلبات الدفع' },
  { id: 'scanners', icon: 'qr_code_scanner', label: 'الماسحون والإعدادات' },
  { id: 'actions', icon: 'admin_panel_settings', label: 'إجراءات استثنائية' },
];

/*
  الشريط الجانبي المشترك لكل صفحات الإدارة.
  - activeId: العنصر المفعّل (المظلّل) بالقائمة (مثلاً "payments")
  - currentId: الصفحة الحالية فعلياً (الافتراضي = activeId). الضغط عليها ما بيعمل تنقل.
    بتفيد للصفحات الفرعية، مثلاً قائمة المتطوعين: activeId="dashboard" و currentId="volunteers"
  - showAddButton: إظهار زر "إضافة تذكرة جديدة" (الافتراضي true)
  - open / onClose: فتح وإغلاق القائمة على الشاشات الصغيرة (الصفحة بتمسك الحالة)
  - شارة "طلبات الدفع" بتنقرأ تلقائياً من AdminStatsProvider (بـ App.jsx)، فما في رقم داخل الكومبوننت
*/
export default function AdminSidebar({
  activeId,
  currentId = activeId,
  showAddButton = true,
  open = false,
  onClose,
  onNavigate,
  onAddTicket,
  onLogout,
  adminName = 'مسؤول الاتحاد',
}) {
  const { pendingPayments } = useAdminStats();

  const handleNav = (e, id) => {
    e.preventDefault();
    if (onClose) onClose();
    if (id !== currentId && onNavigate) onNavigate(id);
  };

  return (
    <>
      {/* خلفية تعتيم القائمة على الشاشات الصغيرة */}
      {open && <div className="adm-overlay" onClick={onClose}></div>}

      <aside className={`adm-sidebar ${open ? 'open' : ''}`} aria-label="القائمة الجانبية">
        <div className="adm-sidebar-inner">
          <div>
            {/* الشعار */}
            <div className="adm-brand-header">
              <div className="adm-brand-icon">
                <img className="adm-brand-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
              </div>
              <div className="adm-brand-titles">
                <h1>جامعة حمص</h1>
                <p>حفل التخرج — لوحة الإدارة</p>
              </div>
              <button
                type="button"
                className="adm-sidebar-close"
                aria-label="إغلاق القائمة"
                onClick={onClose}
              >
                <span className="adm-symbol">close</span>
              </button>
            </div>

            {/* روابط التنقل */}
            <nav className="adm-nav-cluster" aria-label="التنقل">
              {NAV_ITEMS.map((item) => {
                const active = item.id === activeId;
                const badge = item.id === 'payments' ? pendingPayments : 0;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`adm-nav-link ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={(e) => handleNav(e, item.id)}
                  >
                    <span className={`adm-symbol ${active ? 'fill' : ''}`}>{item.icon}</span>
                    <span>{item.label}</span>
                    {badge ? <span className="adm-nav-badge">{badge}</span> : null}
                  </a>
                );
              })}
            </nav>

            {/* زر إضافة تذكرة */}
            {showAddButton && (
              <div className="adm-sidebar-cta">
                <button type="button" className="adm-btn-add" onClick={onAddTicket}>
                  <span className="adm-symbol" style={{ fontSize: '18px' }}>
                    add
                  </span>
                  <span>إضافة تذكرة جديدة</span>
                </button>
              </div>
            )}
          </div>

          {/* معلومات المستخدم وتسجيل الخروج */}
          <div className="adm-sidebar-footer">
            <div className="adm-user-row">
              <div className="adm-user-avatar">
                <span className="adm-symbol">person</span>
              </div>
              <div className="adm-user-info">
                <p className="adm-user-name">{adminName}</p>
              </div>
            </div>

            <button type="button" className="adm-nav-link adm-logout-btn" onClick={onLogout}>
              <span className="adm-symbol">logout</span>
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}