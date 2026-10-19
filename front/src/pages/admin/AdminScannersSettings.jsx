import React, { useState, useEffect, useRef } from 'react';
import '../../style/AdminScannersSettings.css';
import AdminSidebar from '../../components/AdminSidebar';
import { useAdminEvents } from './hooks/useAdminEvents.js';
import { useAdminScanners, createScanner, deleteScanner } from './hooks/useAdminScanners.js';
import {
  useAdminSettings,
  updateAdminSettings,
  uploadShamcashQr,
  deleteShamcashQr,
} from './hooks/useAdminSettings.js';
import { ApiError } from '../../api/admin.js';

const QR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const QR_MAX_MB = 1;

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
  const [activeTab, setActiveTab] = useState('scanners'); // 'scanners' | 'settings'
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

  // ===== قسم الإعدادات =====
  const { settings, loading: settingsLoading, error: settingsError, refetch: refetchSettings } =
    useAdminSettings();
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [shamCashAccount, setShamCashAccount] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [qrPreview, setQrPreview] = useState('');
  const [qrUploading, setQrUploading] = useState(false);
  const qrInputRef = useRef(null);

  // علامة تعديل يدوي: تمنع إعادة تهيئة حقول نموذج الدفع عند أي تحديث للاعدادات
  // (مثل بعد رفع صورة QR، إذ يُعاد جلب الإعدادات وتُمسح ما كتبه المشرف).
  const settingsDirtyRef = useRef(false);

  useEffect(() => {
    if (!settings) return;
    if (settingsDirtyRef.current) return;
    setBeneficiaryName(settings.shamcash_receiver_name || '');
    setShamCashAccount(settings.shamcash_account_number || '');
    setSupportPhone(settings.contact_phone || '');
  }, [settings]);

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

  // تحرير رابط معاينة الـ QR عند الاستبدال/الإزالة
  useEffect(() => {
    return () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    };
  }, [qrPreview]);

  const eventName = (id) => {
    const found = events.find((e) => String(e.id) === String(id));
    return found ? found.name : '—';
  };

  const scannersCount = scanners.length;
  const currentQr = qrPreview || (settings && settings.shamcash_qr_image) || '';

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

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setActionError('');
    try {
      setSavingSettings(true);
      await updateAdminSettings({
        shamcash_receiver_name: beneficiaryName,
        shamcash_account_number: shamCashAccount,
        contact_phone: supportPhone,
      });
      setNotice('تم حفظ إعدادات الدفع بنجاح');
      settingsDirtyRef.current = false;
      await refetchSettings();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleQrFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setActionError('');
    if (!QR_TYPES.includes(file.type)) {
      setActionError('صيغة الصورة غير مدعومة. المسموح: PNG أو JPEG أو WEBP');
      if (qrInputRef.current) qrInputRef.current.value = '';
      return;
    }
    if (file.size > QR_MAX_MB * 1024 * 1024) {
      setActionError(`حجم الصورة يتجاوز ${QR_MAX_MB} ميغابايت`);
      if (qrInputRef.current) qrInputRef.current.value = '';
      return;
    }
    try {
      setQrUploading(true);
      await uploadShamcashQr(file);
      setQrPreview(URL.createObjectURL(file));
      setNotice('تم رفع صورة QR الجديدة');
      await refetchSettings();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setQrUploading(false);
      if (qrInputRef.current) qrInputRef.current.value = '';
    }
  };

  const handleDeleteQr = async () => {
    setActionError('');
    if (!window.confirm('هل تريد حذف صورة QR الحالية؟')) return;
    try {
      setQrUploading(true);
      await deleteShamcashQr();
      if (qrPreview) URL.revokeObjectURL(qrPreview);
      setQrPreview('');
      setNotice('تم حذف صورة QR');
      await refetchSettings();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
    } finally {
      setQrUploading(false);
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
          <h2>الماسحون والإعدادات</h2>
          <span>جامعة حمص</span>
        </div>
      </header>

      {/* المحتوى */}
      <main className="scan-set-main-canvas">
        <section className="scan-set-hero-titles">
          <div className="scan-set-pulse-tag">
            <span className="scan-set-mini-dot"></span>
            <span className="scan-set-pulse-label">الماسحون والإعدادات</span>
            <span className="scan-set-pulse-venue">• {scannersCount} حساب ماسح</span>
          </div>
          <h3>إدارة الماسحين وإعدادات الدفع</h3>
          <p>أضف حسابات الماسحين الميدانيين وتحكم بها، وحدّد بيانات حساب شام كاش المعتمد لاستلام رسوم التذاكر.</p>
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

        {/* التبويبات */}
        <div className="scan-set-tabs-header">
          <div className="scan-set-tabs">
            <button
              type="button"
              className={`scan-set-tab-btn ${activeTab === 'scanners' ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab('scanners')}
            >
              <span className="scan-set-symbol" style={{ fontSize: '18px' }}>badge</span>
              <span>الماسحون المعتمدون</span>
              <span className="scan-set-tab-count">{scannersCount} حساب</span>
            </button>

            <button
              type="button"
              className={`scan-set-tab-btn ${activeTab === 'settings' ? 'active' : 'inactive'}`}
              onClick={() => setActiveTab('settings')}
            >
              <span className="scan-set-symbol" style={{ fontSize: '18px' }}>tune</span>
              <span>إعدادات الدفع وشام كاش</span>
            </button>
          </div>

          <span className="scan-set-live-pill">
            <span className="scan-set-live-dot"></span>
            <span>التحقق المباشر متصل عبر QR Scanner</span>
          </span>
        </div>

        {/* القسم الأول: الماسحون */}
        {activeTab === 'scanners' && (
          <>
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
          </>
        )}

        {/* القسم الثاني: إعدادات الدفع */}
        {activeTab === 'settings' && (
          <div className="scan-set-settings-grid">
            <div className="scan-set-card">
              <div className="scan-set-card-head" style={{ justifyContent: 'flex-start' }}>
                <div className="scan-set-card-title">
                  <div className="scan-set-title-icon orange">
                    <span className="scan-set-symbol" style={{ fontSize: '22px' }}>payments</span>
                  </div>
                  <div>
                    <h4>إعدادات الدفع وشام كاش (Sham Cash)</h4>
                    <p>بيانات تحويل رسوم بطاقات التخرج وحساب الفرع الطلابي المعتمد</p>
                  </div>
                </div>
              </div>

              {settingsError && <div className="scan-set-empty" role="alert">{settingsError}</div>}
              {settingsLoading && <div className="scan-set-empty">جارٍ التحميل...</div>}

              <form className="scan-set-form-stack" onSubmit={handleSaveSettings}>
                <div className="scan-set-field">
                  <label className="scan-set-label" htmlFor="beneficiary">اسم المستلم الرسمي (الجهة المستفيدة)</label>
                  <div className="scan-set-input-wrap">
                    <input
                      id="beneficiary"
                      type="text"
                      className="scan-set-input"
                      value={beneficiaryName}
                      onChange={(e) => {
                        settingsDirtyRef.current = true;
                        setBeneficiaryName(e.target.value);
                      }}
                      required
                    />
                    <span className="scan-set-symbol scan-set-input-icon right">account_balance</span>
                  </div>
                  <p className="scan-set-hint">الاسم الذي يظهر للطلاب عند تأكيد عملية تسديد رسوم التخرج.</p>
                </div>

                <div className="scan-set-field">
                  <label className="scan-set-label" htmlFor="shamcash">رقم الحساب في محفظة شام كاش</label>
                  <div className="scan-set-input-wrap">
                    <input
                      id="shamcash"
                      type="text"
                      dir="ltr"
                      className="scan-set-input ltr"
                      value={shamCashAccount}
                      onChange={(e) => {
                        settingsDirtyRef.current = true;
                        setShamCashAccount(e.target.value);
                      }}
                      required
                    />
                    <span className="scan-set-symbol scan-set-input-icon left">wallet</span>
                  </div>
                  <p className="scan-set-hint">رقم الحساب التعريفي المعتمد لدى محفظة شام كاش.</p>
                </div>

                <div className="scan-set-field">
                  <label className="scan-set-label" htmlFor="support-phone">رقم التواصل مع المسؤول (للدعم المالي والاستفسار)</label>
                  <div className="scan-set-input-wrap">
                    <input
                      id="support-phone"
                      type="tel"
                      dir="ltr"
                      className="scan-set-input ltr"
                      value={supportPhone}
                      onChange={(e) => {
                        settingsDirtyRef.current = true;
                        setSupportPhone(e.target.value);
                      }}
                      required
                    />
                    <span className="scan-set-symbol scan-set-input-icon left">phone_in_talk</span>
                  </div>
                  <p className="scan-set-hint">يظهر للطلاب المتعثرين بالدفع لمراجعة مكتب الاتحاد.</p>
                </div>

                <div className="scan-set-form-actions">
                  <button type="submit" className="scan-set-btn-primary" disabled={savingSettings}>
                    <span className="scan-set-symbol" style={{ fontSize: '18px' }}>check</span>
                    <span>{savingSettings ? 'جارٍ الحفظ...' : 'حفظ التعديلات والإعدادات'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="scan-set-card scan-set-qr-card">
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#124d44', margin: '0 0 4px 0' }}>
                  رمز الاستجابة السريعة (QR شام كاش)
                </h4>
                <p className="scan-set-hint">الكود المعروض حالياً لتسديد رسوم حفل التخرج</p>
              </div>

              <div className="scan-set-qr-frame">
                <div className="scan-set-qr-box">
                  {currentQr ? (
                    <img src={currentQr} alt="كود الـ QR الحالي لشام كاش" />
                  ) : (
                    <>
                      <span className="scan-set-symbol" style={{ fontSize: '40px' }}>qr_code_2</span>
                      <span>ما في صورة QR مرفوعة</span>
                    </>
                  )}
                </div>
              </div>

              <input
                ref={qrInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="scan-set-file-input"
                aria-label="رفع صورة QR جديد"
                onChange={handleQrFile}
              />
              <button
                type="button"
                className="scan-set-btn-outline full"
                onClick={() => qrInputRef.current && qrInputRef.current.click()}
                disabled={qrUploading}
              >
                <span className="scan-set-symbol" style={{ fontSize: '18px' }}>cloud_upload</span>
                <span>{qrUploading ? 'جارٍ الرفع...' : 'رفع صورة QR جديد'}</span>
              </button>
              {(qrPreview || (settings && settings.shamcash_qr_image)) && (
                <button
                  type="button"
                  className="scan-set-btn-outline full danger"
                  onClick={handleDeleteQr}
                  disabled={qrUploading}
                >
                  <span className="scan-set-symbol" style={{ fontSize: '18px' }}>delete</span>
                  <span>حذف صورة QR الحالية</span>
                </button>
              )}
              <span className="scan-set-hint">PNG أو JPG بدقة لا تقل عن 500×500 بكسل</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
