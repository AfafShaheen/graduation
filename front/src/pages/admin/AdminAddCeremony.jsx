import React, { useState, useEffect } from 'react';
import '../../style/AdminAddCeremony.css';
import AdminSidebar from '../../components/AdminSidebar';

const FACULTY_OPTIONS = [
  { key: 'civil', label: 'الهندسة المدنية' },
  { key: 'mech', label: 'الهندسة الميكانيكية' },
  { key: 'it', label: 'الهندسة المعلوماتية' },
  { key: 'arch', label: 'الهندسة المعمارية' },
  { key: 'science', label: 'العلوم' },
  { key: 'arts', label: 'الآداب' },
];

export default function AdminAddCeremony({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onCancel,
  onSubmitSuccess,
  onNavigate,
  onLogout,
}) {
  const [ceremonyName, setCeremonyName] = useState('');
  const [ceremonyDate, setCeremonyDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [whatsappLink, setWhatsappLink] = useState('');
  const [pricePkg2, setPricePkg2] = useState('');
  const [pricePkg3, setPricePkg3] = useState('');
  const [enablePkg3, setEnablePkg3] = useState(true);
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة

  const [faculties, setFaculties] = useState({
    civil: false,
    mech: false,
    it: false,
    arch: false,
    science: false,
    arts: false,
  });

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleFacultyToggle = (key) => {
    setFaculties((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!Object.values(faculties).some(Boolean)) {
      alert('اختر كلية واحدة على الأقل لهذا الحفل');
      return;
    }

    const payload = {
      ceremonyName,
      ceremonyDate,
      startDate,
      endDate,
      whatsappLink,
      pricePkg2,
      pricePkg3,
      enablePkg3,
      faculties,
    };

    if (onSubmitSuccess) {
      onSubmitSuccess(payload);
    } else {
      alert('تم حفظ ونشر الحفل الجديد بنجاح!');
    }
  };

  return (
    <div className="add-cer-app-container">
      {/* الخط التزييني العلوي */}
      <div className="add-cer-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="ceremonies"
        showAddButton={false}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="add-cer-topbar">
        <button
          type="button"
          className="add-cer-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="add-cer-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="add-cer-topbar-title">
          <h2>إضافة حفل جديد</h2>
          <div className="add-cer-breadcrumb">
            <button type="button" onClick={() => onNavigate && onNavigate('dashboard')}>لوحة الإدارة</button>
            <span className="add-cer-symbol" style={{ fontSize: '14px' }}>chevron_left</span>
            <button type="button" onClick={onCancel}>الحفلات</button>
            <span className="add-cer-symbol" style={{ fontSize: '14px' }}>chevron_left</span>
            <span>إضافة حفل جديد</span>
          </div>
        </div>

        <div className="add-cer-topbar-actions">
          <button aria-label="التنبيهات" className="add-cer-icon-btn" title="التنبيهات" type="button">
            <span className="add-cer-symbol">notifications</span>
            <span className="add-cer-notif-dot"></span>
          </button>

          <button aria-label="التقويم" className="add-cer-icon-btn" title="التقويم" type="button">
            <span className="add-cer-symbol">calendar_today</span>
          </button>

          <button className="add-cer-help-btn" type="button">
            <span className="add-cer-symbol" style={{ fontSize: '18px' }}>help_outline</span>
            <span className="add-cer-help-text">المساعدة والدعم</span>
          </button>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="add-cer-main-canvas">
        <div className="add-cer-form-card">
          <div className="add-cer-card-header">
            <div className="add-cer-header-main">
              <div className="add-cer-header-icon-wrap">
                <span className="add-cer-symbol fill" style={{ fontSize: '26px' }}>celebration</span>
              </div>
              <div>
                <h3>بيانات حفل التخرج الجديد</h3>
                <p>عبّي بيانات الفوج الجديد برواق، وبتنزل التذاكر فوراً عالمنظومة للطلاب.</p>
              </div>
            </div>

            <span className="add-cer-tag-pill">
              <span className="add-cer-tag-dot"></span>
              <span>مسودة غير منشورة</span>
            </span>
          </div>

          <form className="add-cer-form" onSubmit={handleSubmit}>
            {/* اسم الحفل */}
            <div className="add-cer-field-group">
              <label className="add-cer-label" htmlFor="ceremony-name">
                اسم الحفل الرسمي <span className="add-cer-req">*</span>
              </label>
              <div className="add-cer-input-wrap">
                <input
                  id="ceremony-name"
                  type="text"
                  className="add-cer-input with-icon-left"
                  value={ceremonyName}
                  onChange={(e) => setCeremonyName(e.target.value)}
                  placeholder="مثال: حفل كليات الهندسة — الدفعة 44"
                  required
                />
                <span className="add-cer-symbol add-cer-input-icon left">edit_note</span>
              </div>
              <p className="add-cer-hint">
                هذا الاسم رح يظهر بمنتصف التذكرة الإلكترونية وعلى شاشات التحقق عند بوابات المدرج.
              </p>
            </div>

            <div className="add-cer-divider"></div>

            {/* المواعيد */}
            <div className="add-cer-field-group" style={{ gap: '16px' }}>
              <div className="add-cer-section-head">
                <h4 className="add-cer-section-title">
                  <span className="add-cer-symbol">event_note</span>
                  <span>المواعيد والجدول الزمني</span>
                </h4>
                <span className="add-cer-hint">بتوقيت دمشق (GMT+3)</span>
              </div>

              <div className="add-cer-grid-3">
                <div className="add-cer-field-group">
                  <label className="add-cer-label" htmlFor="ceremony-date">
                    تاريخ الحفل وموعده <span className="add-cer-req">*</span>
                  </label>
                  <input
                    id="ceremony-date"
                    type="datetime-local"
                    className="add-cer-input"
                    value={ceremonyDate}
                    onChange={(e) => setCeremonyDate(e.target.value)}
                    required
                  />
                </div>

                <div className="add-cer-field-group">
                  <label className="add-cer-label" htmlFor="start-date">
                    بداية التسجيل <span className="add-cer-req">*</span>
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    className="add-cer-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="add-cer-field-group">
                  <div className="add-cer-label-row">
                    <label className="add-cer-label" htmlFor="end-date">
                      نهاية التسجيل <span className="add-cer-req">*</span>
                    </label>
                    <button type="button" className="add-cer-extend-btn">
                      <span className="add-cer-symbol" style={{ fontSize: '14px' }}>update</span>
                      <span>تمديد الفترة</span>
                    </button>
                  </div>
                  <input
                    id="end-date"
                    type="date"
                    className="add-cer-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="add-cer-divider"></div>

            {/* الكليات */}
            <div className="add-cer-field-group" style={{ gap: '14px' }}>
              <div className="add-cer-section-head">
                <h4 className="add-cer-section-title">
                  <span className="add-cer-symbol">account_balance</span>
                  <span>الكليات التابعة لهذا الحفل <span className="add-cer-req">*</span></span>
                </h4>
                <span className="add-cer-hint">حدد الكليات المشمولة بهذا الفوج للتوزيع على المدرج</span>
              </div>

              <div className="add-cer-chips-grid">
                {FACULTY_OPTIONS.map((item) => (
                  <label key={item.key} className="add-cer-chip">
                    <input
                      type="checkbox"
                      checked={faculties[item.key]}
                      onChange={() => handleFacultyToggle(item.key)}
                    />
                    <div className="add-cer-chip-box">
                      <span className="add-cer-symbol">
                        {faculties[item.key] ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span>{item.label}</span>
                    </div>
                  </label>
                ))}

                {/* كليات مقفلة */}
                <div className="add-cer-chip-disabled">
                  <span className="add-cer-symbol" style={{ fontSize: '16px' }}>lock</span>
                  <span>كلية الطب البشري</span>
                  <span className="add-cer-chip-note">مرتبطة بحفل الكليات الطبية</span>
                </div>
                <div className="add-cer-chip-disabled">
                  <span className="add-cer-symbol" style={{ fontSize: '16px' }}>block</span>
                  <span>الصيدلة</span>
                </div>
              </div>
            </div>

            <div className="add-cer-divider"></div>

            {/* واتساب */}
            <div className="add-cer-field-group">
              <label className="add-cer-label" htmlFor="whatsapp-input">
                <span className="add-cer-symbol" style={{ color: '#124d44' }}>chat</span>
                رابط مجموعة واتساب للحفل
              </label>
              <input
                id="whatsapp-input"
                type="url"
                dir="ltr"
                className="add-cer-input ltr"
                value={whatsappLink}
                onChange={(e) => setWhatsappLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
              />
              <p className="add-cer-hint with-icon">
                <span className="add-cer-symbol">info</span>
                <span>
                  الرابط بيروح تلقائياً للطالب بعد تثبيت الدفع مشان التنسيق واستلام أرواب التخرج ومواعيد البروفات.
                </span>
              </p>
            </div>

            <div className="add-cer-divider"></div>

            {/* التسعير */}
            <div className="add-cer-field-group" style={{ gap: '16px' }}>
              <div className="add-cer-section-head">
                <div>
                  <h4 className="add-cer-section-title">
                    <span className="add-cer-symbol">payments</span>
                    <span>تسعير باقات التذاكر</span>
                  </h4>
                  <p className="add-cer-hint" style={{ marginTop: '2px' }}>
                    تحديد الرسوم المعتمدة مع محاسبة الكلية
                  </p>
                </div>
                <span className="add-cer-currency">العملة: ليرة سورية (ل.س)</span>
              </div>

              <div className="add-cer-grid-2">
                <div className="add-cer-pkg-card">
                  <div className="add-cer-pkg-head">
                    <div className="add-cer-pkg-title">
                      <span className="add-cer-symbol" style={{ color: '#124d44' }}>confirmation_number</span>
                      <span>باقة "خريج + ٢ مرافقين"</span>
                    </div>
                    <span className="add-cer-pkg-badge green">الأساسية</span>
                  </div>
                  <div className="add-cer-input-wrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="سعر باقة خريج + ٢ مرافقين"
                      className="add-cer-input add-cer-price-input"
                      value={pricePkg2}
                      onChange={(e) => setPricePkg2(e.target.value)}
                      placeholder="مثال: 125,000"
                      required
                    />
                    <span className="add-cer-price-unit">ل.س</span>
                  </div>
                  <p className="add-cer-hint">تشمل روب التخرج + شهادة الحفل + مقعدين للمرافقين بالمدرج.</p>
                </div>

                <div className="add-cer-pkg-card">
                  <div className="add-cer-pkg-head">
                    <div className="add-cer-pkg-title">
                      <span className="add-cer-symbol" style={{ color: '#ca4b00' }}>confirmation_number</span>
                      <span>باقة "خريج + ٣ مرافقين"</span>
                    </div>
                    <span className="add-cer-pkg-badge orange">مقعد إضافي</span>
                  </div>
                  <div className="add-cer-input-wrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="سعر باقة خريج + ٣ مرافقين"
                      className="add-cer-input add-cer-price-input"
                      value={pricePkg3}
                      onChange={(e) => setPricePkg3(e.target.value)}
                      placeholder="مثال: 160,000"
                      disabled={!enablePkg3}
                      required={enablePkg3}
                    />
                    <span className="add-cer-price-unit">ل.س</span>
                  </div>
                  <p className="add-cer-hint">حسب الطاقة الاستيعابية لمدرج الباسل الكبير.</p>
                </div>
              </div>

              <div className="add-cer-toggle-box">
                <div className="add-cer-toggle-main">
                  <label className="add-cer-switch">
                    <input
                      type="checkbox"
                      checked={enablePkg3}
                      onChange={() => setEnablePkg3(!enablePkg3)}
                      aria-label='تفعيل نوع "خريج + ٣ مرافقين"'
                    />
                    <span className="add-cer-slider"></span>
                  </label>
                  <div>
                    <div className="add-cer-toggle-title">
                      <span>تفعيل نوع "خريج + ٣ مرافقين"</span>
                      <span className="add-cer-symbol" title="محمي بنظام القفل">lock</span>
                    </div>
                    <span className="add-cer-hint">
                      إتاحة خيار المقعد الثالث لطلاب هذا الفوج أثناء استمارة الحجز.
                    </span>
                  </div>
                </div>

                <span className="add-cer-warn-pill">
                  <span className="add-cer-symbol">warning</span>
                  <span>ملاحظة: ما بيتغيّر بعد بدء التسجيل</span>
                </span>
              </div>
            </div>

            <div className="add-cer-divider"></div>

            {/* الأزرار */}
            <div className="add-cer-form-footer">
              <button type="button" className="add-cer-btn-cancel" onClick={onCancel}>
                إلغاء والعودة لقائمة الحفلات
              </button>

              <button type="submit" className="add-cer-btn-submit">
                <span>حفظ ونشر الحفل الجديد</span>
                <span className="add-cer-symbol" style={{ fontSize: '20px' }}>cloud_upload</span>
              </button>
            </div>
          </form>
        </div>

        <p className="add-cer-footer-note">
          <span className="add-cer-symbol">verified_user</span>
          <span>منظومة إدارة التذاكر الموحدة — الاتحاد الوطني لطلبة سورية، فرع جامعة حمص</span>
        </p>
      </main>
    </div>
  );
}