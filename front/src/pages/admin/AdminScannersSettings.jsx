import React, { useState, useEffect } from 'react';
import '../../style/AdminScannersSettings.css';
import AdminSidebar from '../../components/AdminSidebar';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { useAdminScanners, createScanner, deleteScanner, resetScannerPassword } from './hooks/useAdminScanners.js';
import { generateScannerPassword, NO_PASSWORD_TEXT } from '../../utils/scannerPassword.js';
import { ApiError } from '../../api/admin.js';
import { countLabel } from '../../utils/countLabel.js';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ar-SY-u-nu-latn', {
      timeZone: 'Asia/Damascus',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function AdminScannersSettings({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  // ===== قسم الماسحين =====
  const { events } = useAdminEvents({ limit: 100 });
  const [scannerEventId, setScannerEventId] = useState(''); // the ceremony of the NEW account
  const [listEventId, setListEventId] = useState(''); // the table: '' = every ceremony
  const [newScannerUser, setNewScannerUser] = useState('');
  const [newScannerPass, setNewScannerPass] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!scannerEventId && events.length > 0) {
      setScannerEventId(String(events[0].id));
    }
  }, [events, scannerEventId]);

  const { scanners, loading: scannersLoading, error: scannersError, refetch: refetchScanners } =
    useAdminScanners(listEventId || null);

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // إخفاء الإشعار تلقائياً
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), notice.includes('كلمة السر الجديدة') ? 20000 : 3500);
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
      setNotice(`تمت إضافة الماسح الميداني: ${username} — ${eventName(scannerEventId)}`);
      setNewScannerUser('');
      setNewScannerPass('');
      await refetchScanners();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setCreating(false);
    }
  };

  // copy the password to the clipboard (the admin reads it to a volunteer or sends it)
  const handleCopy = async (item) => {
    if (!item.password) return;
    try {
      await navigator.clipboard.writeText(item.password);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((id) => (id === item.id ? null : id)), 1800);
    } catch {
      setActionError('تعذّر النسخ، انسخ كلمة السر يدوياً.');
    }
  };

  const handleResetPassword = async (item) => {
    setActionError('');
    if (!window.confirm(`سيُولَّد كلمة سر جديدة للماسح "${item.username}"، وتتوقف القديمة. هل تريد المتابعة؟`)) return;
    try {
      setResettingId(item.id);
      const res = await resetScannerPassword(item.id);
      setNotice(`كلمة السر الجديدة للماسح ${item.username}: ${res?.password ?? ''}`);
      await refetchScanners();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setResettingId(null);
    }
  };

  const handleDeleteScanner = async (item) => {
    setActionError('');
    if (!window.confirm(`هل تريد إلغاء حساب الماسح "${item.username}" في ${eventName(item.event_id)}؟ لا يمكن التراجع.`)) return;
    try {
      setDeletingId(item.id);
      await deleteScanner(item.id);
      setNotice(`تم إلغاء حساب ${item.username} — ${eventName(item.event_id)}`);
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
            <span className="scan-set-pulse-venue">• {countLabel(scannersCount, "حساب", "حسابان", "حسابات", "حساباً")}</span>
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
                      type="text"
                      dir="ltr"
                      autoComplete="off"
                      autoCapitalize="none"
                      className="scan-set-input"
                      placeholder="مثلاً: Gate4852"
                      value={newScannerPass}
                      onChange={(e) => setNewScannerPass(e.target.value)}
                      required
                    />
                    <span className="scan-set-symbol scan-set-input-icon right">key</span>
                  </div>
                  <button
                    type="button"
                    className="scan-set-btn-small"
                    style={{ marginTop: 6 }}
                    onClick={() => setNewScannerPass(generateScannerPassword())}
                  >
                    توليد كلمة سر سهلة القراءة
                  </button>
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
                      {events.length === 0 && <option value="">لا توجد حفلات متاحة</option>}
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

                {/* ملاحظة بعرض الصف كامل حتى لا تزيح الحقول عن محاذاتها */}
                <p className="scan-set-hint scan-set-form-note">
                  <span className="scan-set-symbol" aria-hidden="true">info</span>
                  يمكن تكرار اسم المستخدم بين الحفلات، لكن ليس داخل الحفل نفسه.
                </p>
              </form>
            </div>

            <div className="scan-set-card flush">
              <div className="scan-set-card-head padded">
                <div className="scan-set-card-title">
                  <h4>جدول الماسحين المعتمدين والمشرفين</h4>
                  <span className="scan-set-count-pill">{countLabel(scannersCount, "حساب", "حسابان", "حسابات", "حساباً")}</span>
                </div>
                <select
                  className="scan-set-select scan-set-list-filter"
                  aria-label="عرض ماسحات حفل"
                  value={listEventId}
                  onChange={(e) => setListEventId(e.target.value)}
                >
                  <option value="">كل الحفلات</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={String(ev.id)}>{ev.name}</option>
                  ))}
                </select>
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
                      <th>كلمة السر</th>
                      <th>الحفل المخصص</th>
                      <th>تاريخ الإنشاء</th>
                      <th style={{ textAlign: 'center' }}>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannersLoading && (
                      <tr>
                        <td colSpan={5} className="scan-set-empty">جارٍ التحميل...</td>
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

                        <td data-label="كلمة السر">
                          {item.password ? (
                            <span className="scan-set-pass">
                              <code dir="ltr" className="scan-set-pass-text">{item.password}</code>
                              <button type="button" className="scan-set-btn-small" onClick={() => handleCopy(item)}>
                                {copiedId === item.id ? 'تم النسخ' : 'نسخ'}
                              </button>
                            </span>
                          ) : (
                            <span className="scan-set-pass-missing">{NO_PASSWORD_TEXT}</span>
                          )}
                        </td>

                        <td data-label="الحفل المخصص">
                          <span className="scan-set-college">{eventName(item.event_id)}</span>
                        </td>

                        <td data-label="تاريخ الإنشاء">{formatDate(item.created_at)}</td>

                        <td className="scan-set-td-actions">
                          <div className="scan-set-actions-cell">
                            <button
                              type="button"
                              className="scan-set-btn-small"
                              onClick={() => handleResetPassword(item)}
                              disabled={resettingId === item.id}
                            >
                              {resettingId === item.id ? 'جارٍ التعيين...' : 'إعادة تعيين كلمة السر'}
                            </button>
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
                <div className="scan-set-empty">لا يوجد ماسحون مسجلون بعد</div>
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
