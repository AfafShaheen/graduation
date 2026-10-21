import React, { useEffect, useState } from 'react';
import '../style/AdminSidebar.css';
import unionLogo from '../assets/only-logo.png';
import { useAdminStats } from '../context/AdminStatsContext';

const COLLAPSE_KEY = 'adm.sidebar.collapsed';
/* عرض الشريط الجانبي مطوياً (شريط ضيّق يحوي زر التوسيع) — لا يختفي تماماً
   حتى لا تزحلق الصفحات تحت الزر العائم وتغطي عناوينها */
const COLLAPSED_WIDTH = '56px';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/* عناصر القائمة: id هو اسم القسم اللي بيوصل لـ onNavigate (مثلاً /admin/payments) */
const NAV_ITEMS = [
  { id: 'dashboard', icon: 'dashboard', label: 'لوحة الإحصائيات' },
  { id: 'ceremonies', icon: 'school', label: 'الحفلات' },
  { id: 'colleges', icon: 'account_balance', label: 'كليات واختصاصات' },
  { id: 'files', icon: 'folder_shared', label: 'ملفات البيانات' },
  { id: 'payments', icon: 'receipt_long', label: 'طلبات الدفع' },
  { id: 'scanners', icon: 'qr_code_scanner', label: 'الماسحون' },
  { id: 'actions', icon: 'admin_panel_settings', label: 'إجراءات استثنائية' },
];

/*
  الشريط الجانبي المشترك لكل صفحات الإدارة.
  - activeId: العنصر المفعّل (المظلّل) بالقائمة (مثلاً "payments")
  - currentId: الصفحة الحالية فعلياً (الافتراضي = activeId). الضغط عليها ما بيعمل تنقل.
    بتفيد للصفحات الفرعية، مثلاً قائمة المتطوعين: activeId="dashboard" و currentId="volunteers"
  - open / onClose: فتح وإغلاق القائمة على الشاشات الصغيرة (الصفحة بتمسك الحالة)
  - شارة "طلبات الدفع" بتنقرأ تلقائياً من AdminStatsProvider (بـ App.jsx)، فما في رقم داخل الكومبوننت
*/
export default function AdminSidebar({
  activeId,
  currentId = activeId,
  open = false,
  onClose,
  onNavigate,
  onLogout,
  adminName = 'مسؤول الاتحاد',
}) {
  const { pendingPayments } = useAdminStats();
  // طيّ الشريط على الديسكتوب (يُحفظ الاختيار للجلسات القادمة)
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--adm-sb-width', collapsed ? COLLAPSED_WIDTH : '288px');
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* تجاهل عدم توفر التخزين */
    }
    return () => root.style.removeProperty('--adm-sb-width');
  }, [collapsed]);

  const handleNav = (e, id) => {
    e.preventDefault();
    if (onClose) onClose();
    if (id !== currentId && onNavigate) onNavigate(id);
  };

  // على الديسكتوب الزر يطوي/يوسّع الشريط، وعلى الجوال يقفل القائمة
  const handleToggle = () => {
    const isDesktop =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) setCollapsed((c) => !c);
    else if (onClose) onClose();
  };

  return (
    <>
      {/* خلفية تعتيم القائمة على الشاشات الصغيرة */}
      {open && <div className="adm-overlay" onClick={onClose}></div>}

      <aside
        className={`adm-sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        aria-label="القائمة الجانبية"
      >
        {/* زر توسيع الشريط بعد طيّه — داخل الشريط نفسه حتى لا يغطّي عنوان الصفحة */}
        {collapsed && (
          <button
            type="button"
            className="adm-expand-btn"
            aria-label="توسيع القائمة الجانبية"
            onClick={() => setCollapsed(false)}
          >
            <span className="adm-symbol">menu_open</span>
          </button>
        )}

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
                aria-label="طي القائمة"
                onClick={handleToggle}
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
