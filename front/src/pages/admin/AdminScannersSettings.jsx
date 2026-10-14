import React, { useState, useEffect, useRef } from 'react';
import '../../style/AdminScannersSettings.css';
import AdminSidebar from '../../components/AdminSidebar';

/* ==========================================================================
   بيانات تجريبية: لما يجهز الباك إند بدّلها ببيانات حقيقية (عبر props)
   ========================================================================== */
const SCANNERS = [
  {
    id: '01',
    username: 'scanner.civil.1',
    college: 'كلية الهندسة المدنية — المدرج الكبير',
    status: 'active',
  },
  {
    id: '02',
    username: 'scanner.it.vip',
    college: 'كلية الهندسة المعلوماتية والكهربائية',
    status: 'active',
  },
  {
    id: '03',
    username: 'scanner.med.students',
    college: 'كلية الطب البشري والصيدلة',
    status: 'pending',
  },
  {
    id: '04',
    username: 'scanner.arts.b',
    college: 'كلية الآداب والعلوم الإنسانية',
    status: 'frozen',
  },
];

const CEREMONY_OPTIONS = [
  'حفل كلية الهندسة المدنية — الدفعة 46 (المدرج الكبير)',
  'حفل كلية الهندسة المعلوماتية والكهربائية (المدرج 2)',
  'حفل كلية الطب البشري والصيدلة (الصالة الرياضية المركزية)',
  'حفل كلية الآداب والعلوم الإنسانية (مدرج الباسل)',
];

const STATUS_LABELS = {
  active: 'نشط حالياً (متصل)',
  pending: 'في وضع الانتظار (لم يبدأ)',
  frozen: 'مجمّد مؤقتاً',
};

const STATUS_ICONS = {
  active: 'check_circle',
  pending: 'schedule',
  frozen: 'block',
};

export default function AdminScannersSettings({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  scanners = SCANNERS,
  initialSettings = {
    beneficiaryName: 'فرع الاتحاد الوطني لطلبة سورية - جامعة حمص',
    shamCashAccount: 'SC-96331-884021',
    supportPhone: '+963 933 552 140',
  },
  onAddScanner,
  onChangeScannerPassword,
  onToggleScannerFreeze,
  onSaveSettings,
  onUploadQr,
  onAddTicket,
  onNavigate,
  onLogout,
}) {
  const [activeTab, setActiveTab] = useState('scanners'); // 'scanners' | 'settings'
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة
  const [notice, setNotice] = useState('');
  const [list, setList] = useState(scanners);

  // نموذج إضافة ماسح
  const [newScannerUser, setNewScannerUser] = useState('');
  const [newScannerPass, setNewScannerPass] = useState('');
  const [newScannerCeremony, setNewScannerCeremony] = useState(CEREMONY_OPTIONS[0]);

  // إعدادات الدفع
  const [beneficiaryName, setBeneficiaryName] = useState(initialSettings.beneficiaryName);
  const [shamCashAccount, setShamCashAccount] = useState(initialSettings.shamCashAccount);
  const [supportPhone, setSupportPhone] = useState(initialSettings.supportPhone);
  const [qrPreview, setQrPreview] = useState('');
  const qrInputRef = useRef(null);

  useEffect(() => {
    setList(scanners);
  }, [scanners]);

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

  // تحرير رابط معاينة الـ QR عند الاستبدال
  useEffect(() => {
    return () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    };
  }, [qrPreview]);

  const activeCount = list.filter((s) => s.status === 'active').length;

  const handleAddScanner = (e) => {
    e.preventDefault();
    const username = newScannerUser.trim();
    if (!username || !newScannerPass) return;

    const scanner = {
      id: String(list.length + 1).padStart(2, '0'),
      username,
      college: newScannerCeremony,
      status: 'pending',
    };

    setList((prev) => [...prev, scanner]);
    if (onAddScanner) onAddScanner({ ...scanner, password: newScannerPass });
    setNotice(`تمت إضافة الماسح الميداني: ${username}`);
    setNewScannerUser('');
    setNewScannerPass('');
  };

  const handleToggleFreeze = (item) => {
    const next = item.status === 'frozen' ? 'pending' : 'frozen';
    setList((prev) => prev.map((s) => (s.id === item.id ? { ...s, status: next } : s)));
    if (onToggleScannerFreeze) onToggleScannerFreeze(item, next);
    setNotice(next === 'frozen' ? `تم تجميد حساب ${item.username}` : `تمت إعادة تفعيل حساب ${item.username}`);
  };

  const handleChangePassword = (item) => {
    if (onChangeScannerPassword) onChangeScannerPassword(item);
    setNotice(`طلب تغيير كلمة السر لحساب ${item.username}`);
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    if (onSaveSettings) onSaveSettings({ beneficiaryName, shamCashAccount, supportPhone });
    setNotice('تم حفظ إعدادات الدفع بنجاح');
  };

  const handleQrFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setQrPreview(URL.createObjectURL(file));
    if (onUploadQr) onUploadQr(file);
    setNotice('تم اختيار صورة QR الجديدة');
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
          <span>جامعة حمص • شعبة الحفلات والتخرج</span>
        </div>

        <div className="scan-set-topbar-actions">
          <button aria-label="التنبيهات" className="scan-set-icon-btn" title="التنبيهات" type="button">
            <span className="scan-set-symbol">notifications</span>
            <span className="scan-set-notif-dot"></span>
          </button>

          <button className="scan-set-help-btn" type="button">
            <span className="scan-set-symbol" style={{ fontSize: '18px' }}>help_outline</span>
            <span className="scan-set-help-text">المساعدة والدعم</span>
          </button>
        </div>
      </header>

      {/* المحتوى */}
      <main className="scan-set-main-canvas">
        <section className="scan-set-hero-titles">
          <div className="scan-set-pulse-tag">
            <span className="scan-set-mini-dot"></span>
            <span className="scan-set-pulse-label">الماسحون والإعدادات</span>
            <span className="scan-set-pulse-venue">• {activeCount} ماسح نشط الآن</span>
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
              <span className="scan-set-tab-count">{activeCount} نشط</span>
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
                  <label className="scan-set-label" htmlFor="scanner-ceremony">الحفل والكلية المخصصة</label>
                  <div className="scan-set-input-wrap">
                    <select
                      id="scanner-ceremony"
                      className="scan-set-select"
                      value={newScannerCeremony}
                      onChange={(e) => setNewScannerCeremony(e.target.value)}
                    >
                      {CEREMONY_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <span className="scan-set-symbol scan-set-input-icon right">school</span>
                  </div>
                </div>

                <button type="submit" className="scan-set-btn-primary">
                  <span className="scan-set-symbol" style={{ fontSize: '20px' }}>add</span>
                  <span>إضافة ماسح جديد</span>
                </button>
              </form>
            </div>

            <div className="scan-set-card flush">
              <div className="scan-set-card-head padded">
                <div className="scan-set-card-title">
                  <h4>جدول الماسحين المعتمدين والمشرفين</h4>
                  <span className="scan-set-count-pill">{list.length} حسابات مسجلة</span>
                </div>
                <button type="button" className="scan-set-refresh-btn" onClick={() => setList(scanners)}>
                  <span className="scan-set-symbol" style={{ fontSize: '18px' }}>refresh</span>
                  <span>تحديث الحالة الميدانية</span>
                </button>
              </div>

              <div className="scan-set-table-wrapper">
                <table className="scan-set-table">
                  <thead>
                    <tr>
                      <th>اسم المستخدم</th>
                      <th>الحفل المخصص والكلية</th>
                      <th>حالة النشاط الميداني</th>
                      <th style={{ textAlign: 'center' }}>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((item) => {
                      const frozen = item.status === 'frozen';
                      return (
                        <tr key={item.id}>
                          <td className="scan-set-td-user">
                            <div className="scan-set-user-cell">
                              <span className="scan-set-user-no">{item.id}</span>
                              <span>{item.username}</span>
                            </div>
                          </td>

                          <td data-label="الحفل المخصص والكلية">
                            <span className="scan-set-college">{item.college}</span>
                          </td>

                          <td data-label="حالة النشاط الميداني">
                            <span className={`scan-set-chip ${item.status}`}>
                              <span className="scan-set-symbol">{STATUS_ICONS[item.status]}</span>
                              <span>{STATUS_LABELS[item.status]}</span>
                            </span>
                          </td>

                          <td className="scan-set-td-actions">
                            <div className="scan-set-actions-cell">
                              <button
                                type="button"
                                className="scan-set-btn-small"
                                onClick={() => handleChangePassword(item)}
                              >
                                تغيير كلمة السر
                              </button>
                              <button
                                type="button"
                                className={`scan-set-btn-small ${frozen ? 'success' : 'danger'}`}
                                onClick={() => handleToggleFreeze(item)}
                              >
                                {frozen ? 'إعادة تفعيل الحساب' : 'تجميد الحساب'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {list.length === 0 && <div className="scan-set-empty">ما في ماسحين مسجلين بعد</div>}

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

              <form className="scan-set-form-stack" onSubmit={handleSaveSettings}>
                <div className="scan-set-field">
                  <label className="scan-set-label" htmlFor="beneficiary">اسم المستلم الرسمي (الجهة المستفيدة)</label>
                  <div className="scan-set-input-wrap">
                    <input
                      id="beneficiary"
                      type="text"
                      className="scan-set-input"
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
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
                      onChange={(e) => setShamCashAccount(e.target.value)}
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
                      onChange={(e) => setSupportPhone(e.target.value)}
                      required
                    />
                    <span className="scan-set-symbol scan-set-input-icon left">phone_in_talk</span>
                  </div>
                  <p className="scan-set-hint">يظهر للطلاب المتعثرين بالدفع لمراجعة مكتب الاتحاد.</p>
                </div>

                <div className="scan-set-form-actions">
                  <button type="submit" className="scan-set-btn-primary">
                    <span className="scan-set-symbol" style={{ fontSize: '18px' }}>check</span>
                    <span>حفظ التعديلات والإعدادات</span>
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
                  {qrPreview ? (
                    <img src={qrPreview} alt="كود الـ QR الحالي لشام كاش" />
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
                accept="image/png,image/jpeg"
                className="scan-set-file-input"
                aria-label="رفع صورة QR جديد"
                onChange={handleQrFile}
              />
              <button
                type="button"
                className="scan-set-btn-outline full"
                onClick={() => qrInputRef.current && qrInputRef.current.click()}
              >
                <span className="scan-set-symbol" style={{ fontSize: '18px' }}>cloud_upload</span>
                <span>رفع صورة QR جديد</span>
              </button>
              <span className="scan-set-hint">PNG أو JPG بدقة لا تقل عن 500×500 بكسل</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}