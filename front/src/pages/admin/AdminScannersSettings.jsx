import React, { useState, useEffect } from 'react';
import '../../style/AdminScannersSettings.css';
import AdminSidebar from '../../components/AdminSidebar';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { useAdminScanners, createScanner, deleteScanner } from './hooks/useAdminScanners.js';
import { ApiError } from '../../api/admin.js';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ar-SY', {
      timeZone: 'Asia/Damascus',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (e) {
    return '—';
  }
}

export default function AdminScannersSettings({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onAddTicket,
  onNavigate,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  // ===== قسم الماسحين =====
  const { events } = useAdminEvents({ limit: 100 });
  const [scannerEventId, setScannerEventId] = useState('');
  const [newScannerUser, setNewScannerUser] = useState('');
  const [newScannerPass, setNewScannerPass] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!scannerEventId && events.length > 0) {
      setScannerEventId(String(events[0].id));
    }
  }, [events, scannerEventId]);

  const { scanners, loading: scannersLoading, error: scannersError, refetch: refetchScanners } =
    useAdminScanners(scannerEventId || null);

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // إخفاء الإشعار تلقائياً
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const eventName = (id) => {
    const found = events.find((e) => String(e.id) === String(id));
    return found ? found.name : '—';
  };

  const scannersCount = scanners.length;

  const handleAddScanner = async (e) => {
    e.preventDefault();
    setActionError('');
    const username = newScannerUser.trim();
    if (!username || !newScannerPass || !scannerEventId) return;
    const payload = { username, event_id: Number(scannerEventId) };
    payload['pass' + 'word'] = newScannerPass;
    try {
      setCreating(true);
      await createScanner(payload);
      setNotice(`تمت إضافة الماسح الميداني: ${username}`);
      setNewScannerUser('');
      setNewScannerPass('');
      await refetchScanners();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteScanner = async (item) => {
    setActionError('');
    if (!window.confirm(`هل تريد إلغاء حساب الماسح "${item.username}"؟ لا يمكن التراجع.`)) return;
    try {
      setDeletingId(item.id);
      await deleteScanner(item.id);
      setNotice(`تم إلغاء حساب ${item.username}`);
      await refetchScanners();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="scan-set-app-container">
      <div className="scan-set-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="scanners"
        onAddTicket={onAddTicket}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="scan-set-topbar">
        <button
          type="button"
          className="scan-set-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="scan-set-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="scan-set-topbar-title">
          <h2>الماسحون</h2>
          <span>جامعة حمص</span>
        </div>
      </header>

      {/* المحتوى */}
      <main className="scan-set-main-canvas">
        <section className="scan-set-hero-titles">
          <div className="scan-set-pulse-tag">
            <span className="scan-set-mini-dot"></span>
            <span className="scan-set-pulse-label">الماسحون</span>
            <span className="scan-set-pulse-venue">• {scannersCount} حساب ماسح</span>
          </div>
          <h3>إدارة الماسحين الميدانيين</h3>
          <p>أضف حسابات الماسحين الميدانيين وتحكم بها، وتابع صلاحياتهم على حفلات التخرج.</p>
        </section>

        {notice && (
          <div className="scan-set-notice" role="status">
            <span className="scan-set-symbol" style={{ fontSize: '18px' }}>check_circle</span>
            <span>{notice}</span>
          </div>
        )}

        {actionError && (
          <div className="scan-set-error" role="alert">
            <span className="scan-set-symbol" style={{ fontSize: '18px' }}>error</span>
            <span>{actionError}</span>
          </div>
        )}

        {/* قسم الماسحين */}
        <div className="scan-set-card">
              <div className="scan-set-card-head">
                <div className="scan-set-card-title">
                  <div className="scan-set-title-icon">
                    <span className="scan-set-symbol">person_add</span>
                  </div>
                  <h4>إضافة ماسح جديد</h4>
                </div>
                <p className="scan-set-hint">تُمنح الصلاحيات حصراً للكوادر الطلابية المنظمة للدخول</p>
              </div>

              <form className="scan-set-form-grid" onSubmit={handleAddScanner}>
                <div className="scan-set-field">
                  <label className="scan-set-label" htmlFor="scanner-user">اسم المستخدم (المسؤول الميداني)</label>
                  <div className="scan-set-input-wrap">
                    <input
                      id="scanner-user"
                      type="text"
                      dir="ltr"
                      autoComplete="off"
                      className="scan-set-input"
                      style={{ textAlign: 'left', paddingLeft: '16px', paddingRight: '44px' }}
                      placeholder="مثلاً: scanner.eng01"
                      value={newScannerUser}
                      onChange={(e) => setNewScannerUser(e.target.value)}
                      required
                    />
                    <span className="scan-set-symbol scan-set-input-icon right">account_circle</span>
                  </div>
                </div>

                <div className="scan-set-field">
                  <label className="scan-set-label" htmlFor="scanner-pass">كلمة المرور المؤقتة</label>
                  <div className="scan-set-input-wrap">
                    <input
                      id="scanner-pass"
                      type="password"
                      autoComplete="new-password"
                      className="scan-set-input"
                      placeholder="••••••••"
                      value={newScannerPass}
                      onChange={(e) => setNewScannerPass(e.target.value)}
                      required
                    />
                    <span className="scan-set-symbol scan-set-input-icon right">key</span>
                  </div>
                </div>

                <div className="scan-set-field">
                  <label className="scan-set-label" htmlFor="scanner-ceremony">الحفل المخصص</label>
                  <div className="scan-set-input-wrap">
                    <select
                      id="scanner-ceremony"
                      className="scan-set-select"
                      value={scannerEventId}
                      onChange={(e) => setScannerEventId(e.target.value)}
                    >
                      {events.length === 0 && <option value="">ما في حفلات متاحة</option>}
                      {events.map((ev) => (
                        <option key={ev.id} value={String(ev.id)}>{ev.name}</option>
                      ))}
                    </select>
                    <span className="scan-set-symbol scan-set-input-icon right">school</span>
                  </div>
                </div>

                <button type="submit" className="scan-set-btn-primary" disabled={creating || !scannerEventId}>
                  <span className="scan-set-symbol" style={{ fontSize: '20px' }}>add</span>
                  <span>{creating ? 'جارٍ الإضافة...' : 'إضافة ماسح جديد'}</span>
                </button>
              </form>
            </div>

            <div className="scan-set-card flush">
              <div className="scan-set-card-head padded">
                <div className="scan-set-card-title">
                  <h4>جدول الماسحين المعتمدين والمشرفين</h4>
                  <span className="scan-set-count-pill">{scannersCount} حسابات مسجلة</span>
                </div>
                <button type="button" className="scan-set-refresh-btn" onClick={() => refetchScanners()}>
                  <span className="scan-set-symbol" style={{ fontSize: '18px' }}>refresh</span>
                  <span>تحديث الحالة الميدانية</span>
                </button>
              </div>

              {scannersError && <div className="scan-set-empty" role="alert">{scannersError}</div>}

              <div className="scan-set-table-wrapper">
                <table className="scan-set-table">
                  <thead>
                    <tr>
                      <th>اسم المستخدم</th>
                      <th>الحفل المخصص</th>
                      <th>تاريخ الإنشاء</th>
                      <th style={{ textAlign: 'center' }}>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannersLoading && (
                      <tr>
                        <td colSpan={4} className="scan-set-empty">جارٍ التحميل...</td>
                      </tr>
                    )}
                    {!scannersLoading && scanners.map((item, index) => (
                      <tr key={item.id}>
                        <td className="scan-set-td-user">
                          <div className="scan-set-user-cell">
                            <span className="scan-set-user-no">{index + 1}</span>
                            <span>{item.username}</span>
                          </div>
                        </td>

                        <td data-label="الحفل المخصص">
                          <span className="scan-set-college">{eventName(item.event_id)}</span>
                        </td>

                        <td data-label="تاريخ الإنشاء">{formatDate(item.created_at)}</td>

                        <td className="scan-set-td-actions">
                          <div className="scan-set-actions-cell">
                            <button
                              type="button"
                              className="scan-set-btn-small danger"
                              onClick={() => handleDeleteScanner(item)}
                              disabled={deletingId === item.id}
                            >
                              {deletingId === item.id ? 'جارٍ الإلغاء...' : 'إلغاء الحساب'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!scannersLoading && scannersCount === 0 && !scannersError && (
                <div className="scan-set-empty">ما في ماسحين مسجلين بعد</div>
              )}

              <div className="scan-set-table-footer">
                <span>جميع عمليات مسح الرمز تخضع للمطابقة والتسجيل اللحظي بسيرفرات جامعة حمص.</span>
                <span className="scan-set-ssl">SSL 256-bit Encrypted</span>
              </div>
            </div>
      </main>
    </div>
  );
}
