import React, { useState, useEffect } from 'react';
import '../../style/AdminExceptions.css';
import '../../style/AdminRoster.css';
import AdminSidebar from '../../components/AdminSidebar';
import RosterTab from './roster/RosterTab.jsx';
import AuditTab from './roster/AuditTab.jsx';

const nowLabel = () =>
  new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Damascus',
  }).format(new Date());

const TABS = [
  { id: 'roster', label: 'الخريجون', icon: 'groups' },
  { id: 'audit', label: 'سجل الإجراءات', icon: 'history' },
];

// Graduates page: the full list of everybody in the uploaded files (with their
// registration, ticket, payment and entry state) plus the exceptional actions,
// and a second tab with the audit log of those actions.
export default function AdminExceptions({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'مسؤول النظام',
  onNavigate,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState('roster');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="exc-app-container">
      <div className="exc-top-accent"></div>

      <AdminSidebar
        activeId="actions"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      <header className="exc-topbar">
        <button
          type="button"
          className="exc-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="exc-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="exc-topbar-title">
          <h2>الخريجون</h2>
          <span>القائمة الشاملة والإجراءات الاستثنائية</span>
        </div>

        <div className="exc-topbar-actions">
          <div className="exc-clock-pill">
            <span className="exc-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>schedule</span>
            <span>{nowLabel()}</span>
          </div>
        </div>
      </header>

      <main className="exc-main-canvas">
        <section className="exc-hero-titles">
          <h3>كل خريجي الملفات المرفوعة بمكان واحد</h3>
          <p>
            شوف مين سجّل ومين أكّد بريده ومين دفع ومين دخل، وفلتر حسب أي حالة. وبنفس الصفحة بتقدري
            تنفّذي الإجراءات الاستثنائية، وكل إجراء بيتسجل باسمك بسجل الإجراءات.
          </p>
        </section>

        <div className="rost-tabs" role="tablist" aria-label="أقسام الصفحة">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`rost-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`rost-panel-${t.id}`}
              className={`rost-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="exc-symbol" style={{ fontSize: '20px' }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`rost-panel-${tab}`}
          aria-labelledby={`rost-tab-${tab}`}
          className="rost-panel"
        >
          {tab === 'roster' ? <RosterTab /> : <AuditTab />}
        </div>

        <p className="exc-footer-note">منظومة إدارة فعاليات التخرج المركزية</p>
      </main>
    </div>
  );
}
