import React, { useState, useEffect } from 'react';
import '../../style/AdminAddCeremony.css';
import AdminSidebar from '../../components/AdminSidebar';
import { createAdminEvent, updateAdminEvent, uploadUniversityRecords } from './hooks/useAdminEvents.js';
import { ApiError } from '../../api/admin.js';
import CollegeNamesField from '../../components/CollegeNamesField';
import {
  resolveCollegeNames,
  selectedKeysFromCollegeNames,
} from './facultyOptions.js';

export default function AdminAddCeremony({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  ceremony = null,
  eventId = null,
  registrationStarted = false,
  onCancel,
  onSubmitSuccess,
  onNavigate,
  onLogout,
  children,
}) {
  const isEdit = !!ceremony;
  const [ceremonyName, setCeremonyName] = useState(ceremony?.ceremonyName || '');
  const [ceremonyDate, setCeremonyDate] = useState(ceremony?.ceremonyDate || '');
  const [startDate, setStartDate] = useState(ceremony?.startDate || '');
  const [endDate, setEndDate] = useState(ceremony?.endDate || '');
  const [whatsappLink, setWhatsappLink] = useState(ceremony?.whatsappLink || '');
  const [pricePkg2, setPricePkg2] = useState(ceremony?.pricePkg2 || '');
  const [pricePkg3, setPricePkg3] = useState(ceremony?.pricePkg3 || '');
  const [enablePkg3, setEnablePkg3] = useState(ceremony?.enablePkg3 ?? true);
  const [fieldErrors, setFieldErrors] = useState({});
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة

  // ملف بيانات الجامعة (اختياري عند الحفظ، لكن لازم يكون جاهز قبل فتح التسجيل)
  const [dataFile, setDataFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [uploadSummary, setUploadSummary] = useState(null);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [savedEventId, setSavedEventId] = useState(eventId || null);
  const [retryingUpload, setRetryingUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = React.useRef(null);

  const REQUIRED_COLUMNS = [
    'الاسم',
    'الكنية',
    'اسم الأب',
    'اسم الأم',
    'الجنس',
    'الكلية',
    'التخصص',
    'الرقم الجامعي',
    'حالة الطالب من الأوائل',
    'المعدل',
    'رقم التواصل',
  ];
  const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
  const MAX_SIZE_MB = 25;

  const formatSize = (bytes) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const validateFile = (file) => {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return 'الصيغ المدعومة فقط: xlsx وxls وcsv';
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `حجم الملف يتجاوز ${MAX_SIZE_MB} ميغابايت`;
    }
    return null;
  };

  const handleFiles = (files) => {
    if (!files || !files.length) return;
    const file = files[0];
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      setDataFile(null);
      return;
    }
    setFileError('');
    setDataFile(file);
    setUploadSummary(null);
    setUploadErrors([]);
  };

  const removeFile = () => {
    setDataFile(null);
    setFileError('');
    setUploadErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const blob = new Blob([`\uFEFF${REQUIRED_COLUMNS.join(',')}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'graduates-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [faculties, setFaculties] = useState(() =>
    selectedKeysFromCollegeNames(
      ceremony?.colleges || ceremony?.collegeNames || ceremony?.faculties || [],
    ),
  );
  const [customColleges, setCustomColleges] = useState([]);

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleFacultyToggle = (key) => {
    setFaculties((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddCustomCollege = (name) => {
    const value = String(name || '').trim();
    if (!value) return;
    setCustomColleges((prev) => (prev.includes(value) ? prev : [...prev, value]));
  };

  const handleRemoveCustomCollege = (name) => {
    setCustomColleges((prev) => prev.filter((item) => item !== name));
  };

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const priceToNum = (v) => {
    if (v == null) return 0;
    const s = String(v)
      .replace(/,/g, '')
      .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(48 + (d.charCodeAt(0) - 0x0660)));
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const errFor = (key) => fieldErrors[key];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setFieldErrors({});

    if (!isEdit && resolveCollegeNames(faculties, customColleges).length === 0) {
      setSubmitError('اختر كلية واحدة على الأقل لهذا الحفل');
      return;
    }

    const eventTime = ceremonyDate && ceremonyDate.length >= 16
      ? `${ceremonyDate.slice(11, 16)}:00`
      : null;

    const base = {
      name: ceremonyName,
      event_date: ceremonyDate ? ceremonyDate.slice(0, 10) : ceremonyDate,
      event_time: eventTime,
      seat_prefix: null,
      registration_start: startDate ? `${startDate}T00:00:00+03:00` : startDate,
      registration_end: endDate ? `${endDate}T23:59:59+03:00` : endDate,
      whatsapp_group_link: whatsappLink,
      price_2_companions: priceToNum(pricePkg2),
      price_3_companions: priceToNum(pricePkg3),
    };

    try {
      setSubmitting(true);
      let result;
      if (isEdit) {
        const payload = { ...base };
        if (!registrationStarted) payload.is_3companions_enabled = enablePkg3;
        result = await updateAdminEvent(eventId, payload);
      } else {
        const collegeNames = resolveCollegeNames(faculties, customColleges);
        result = await createAdminEvent({
          ...base,
          is_3companions_enabled: enablePkg3,
          college_names: collegeNames,
        });
      }

      const id = eventId ?? result?.id ?? result?.event_id;
      if (id) setSavedEventId(id);

      if (dataFile && id) {
        setUploadErrors([]);
        try {
          const uploadResult = await uploadUniversityRecords(id, dataFile);
          if (uploadResult?.summary) setUploadSummary(uploadResult.summary);
        } catch (upErr) {
          const details =
            upErr instanceof ApiError && Array.isArray(upErr.data?.errors) ? upErr.data.errors : [];
          setUploadErrors(details);
          setSubmitError(
            'تم حفظ الحفل، لكن لم يُستورد ملف بيانات الخريجين. راجع الأخطاء أدناه ثم أعد المحاولة — الملف باقٍ في النموذج.'
          );
          return;
        }
      }
      if (onSubmitSuccess) {
        onSubmitSuccess(result);
      } else {
        alert(isEdit ? 'تم حفظ التعديلات بنجاح!' : 'تم حفظ ونشر الحفل الجديد بنجاح!');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
        setSubmitError('يرجى تصحيح الحقول المميّزة بالأحمر ثم إعادة المحاولة.');
      } else {
        setSubmitError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // إعادة محاولة رفع الملف بعد نجاح إنشاء/تعديل الحفل
  const handleRetryUpload = async () => {
    if (!savedEventId || !dataFile) return;
    setRetryingUpload(true);
    setSubmitError('');
    setUploadErrors([]);
    try {
      const uploadResult = await uploadUniversityRecords(savedEventId, dataFile);
      if (uploadResult?.summary) setUploadSummary(uploadResult.summary);
    } catch (upErr) {
      const details =
        upErr instanceof ApiError && Array.isArray(upErr.data?.errors) ? upErr.data.errors : [];
      setUploadErrors(details);
      setSubmitError('لم يكتمل الاستيراد بعد. راجع الأخطاء أدناه ثم أعد المحاولة.');
    } finally {
      setRetryingUpload(false);
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
          <h2>{isEdit ? 'تعديل الحفل' : 'إضافة حفل جديد'}</h2>
          <div className="add-cer-breadcrumb">
            <button type="button" onClick={() => onNavigate && onNavigate('dashboard')}>لوحة الإدارة</button>
            <span className="add-cer-symbol" style={{ fontSize: '14px' }}>chevron_left</span>
            <button type="button" onClick={onCancel}>الحفلات</button>
            <span className="add-cer-symbol" style={{ fontSize: '14px' }}>chevron_left</span>
            <span>{isEdit ? 'تعديل الحفل' : 'إضافة حفل جديد'}</span>
          </div>
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
                <h3>{isEdit ? 'بيانات حفل التخرج' : 'بيانات حفل التخرج الجديد'}</h3>
                <p>
                  {isEdit
                    ? 'عدّل بيانات الحفل، والكليات المرتبطة غير قابلة للتغيير بعد الإنشاء.'
                    : 'عبّي بيانات الفوج الجديد برواق، وبتنزل التذاكر فوراً عالمنظومة للطلاب.'}
                </p>
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
              {errFor('name') && (
                <p className="add-cer-file-error" role="alert">{errFor('name')}</p>
              )}
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
                  {errFor('event_date') && (
                    <p className="add-cer-file-error" role="alert">{errFor('event_date')}</p>
                  )}
                  {errFor('event_time') && (
                    <p className="add-cer-file-error" role="alert">{errFor('event_time')}</p>
                  )}
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
                  {errFor('registration_start') && (
                    <p className="add-cer-file-error" role="alert">{errFor('registration_start')}</p>
                  )}
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
                  {errFor('registration_end') && (
                    <p className="add-cer-file-error" role="alert">{errFor('registration_end')}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="add-cer-divider"></div>

            {/* الكليات */}
            <div className="add-cer-field-group" style={{ gap: '14px' }}>
              <div className="add-cer-section-head">
                <h4 className="add-cer-section-title">
                  <span className="add-cer-symbol">account_balance</span>
                  <span>الكليات التابعة لهذا الحفل {!isEdit && <span className="add-cer-req">*</span>}</span>
                </h4>
                <span className="add-cer-hint">
                  {isEdit ? 'الكليات مرتبطة منذ الإنشاء وغير قابلة للتعديل' : 'حدد الكليات المشمولة بهذا الفوج للتوزيع على المدرج'}
                </span>
              </div>

              <CollegeNamesField
                selectedKeys={faculties}
                customNames={customColleges}
                readOnlyNames={isEdit ? ceremony?.collegeNames || [] : null}
                onToggle={handleFacultyToggle}
                onAddCustom={handleAddCustomCollege}
                onRemoveCustom={handleRemoveCustomCollege}
                error={errFor('college_names') || errFor('colleges')}
              />
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
              {errFor('whatsapp_group_link') && (
                <p className="add-cer-file-error" role="alert">{errFor('whatsapp_group_link')}</p>
              )}
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
                  {errFor('price_2_companions') && (
                    <p className="add-cer-file-error" role="alert">{errFor('price_2_companions')}</p>
                  )}
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
                  {errFor('price_3_companions') && (
                    <p className="add-cer-file-error" role="alert">{errFor('price_3_companions')}</p>
                  )}
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
                      disabled={isEdit && registrationStarted}
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

            {/* ملف بيانات الجامعة */}
            <div className="add-cer-field-group" style={{ gap: '14px' }}>
              <div className="add-cer-section-head">
                <h4 className="add-cer-section-title">
                  <span className="add-cer-symbol">upload_file</span>
                  <span>ملف بيانات الخريجين (اختياري)</span>
                </h4>
                <button type="button" className="add-cer-extend-btn" onClick={downloadTemplate}>
                  <span className="add-cer-symbol" style={{ fontSize: '14px' }}>download</span>
                  <span>تحميل قالب فارغ</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(',')}
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)}
              />

              <div
                className={`add-cer-dropzone ${dragOver ? 'over' : ''} ${fileError ? 'error' : ''}`}
                role="button"
                tabIndex={0}
                aria-label="اسحب الملف هنا أو اضغط للتصفح"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
              >
                <span className="add-cer-drop-icon">
                  <span className="add-cer-symbol" style={{ fontSize: '30px' }}>upload_file</span>
                </span>
                <p className="add-cer-drop-title">
                  اسحب ملف Excel أو CSV وأفلته هنا، أو <span>اضغط للتصفح</span>
                </p>
                <p className="add-cer-hint">
                  الصيغ المدعومة: xlsx وxls وcsv — الحجم الأقصى {MAX_SIZE_MB} ميغابايت
                </p>
              </div>

              {fileError && (
                <p className="add-cer-file-error" role="alert">
                  {fileError}
                </p>
              )}

              {dataFile && (
                <div className="add-cer-file-chip">
                  <span className="add-cer-symbol" style={{ color: '#124d44', fontSize: '18px' }}>attach_file</span>
                  <span className="add-cer-file-name">{dataFile.name}</span>
                  <span className="add-cer-file-size">({formatSize(dataFile.size)})</span>
                  <span className="add-cer-symbol add-cer-file-ok" style={{ fontSize: '18px' }}>check_circle</span>
                  <button type="button" className="add-cer-file-remove" aria-label="إزالة الملف" onClick={removeFile}>
                    <span className="add-cer-symbol" style={{ fontSize: '18px' }}>close</span>
                  </button>
                </div>
              )}

              {uploadSummary && (
                <p className="add-cer-hint" role="status" style={{ color: '#124d44' }}>
                  نتيجة الرفع: أُضيف {uploadSummary.added ?? 0}، حُدّث {uploadSummary.updated ?? 0}، تُخطّي{' '}
                  {uploadSummary.skipped ?? 0}، أخطاء {uploadSummary.error_count ?? 0} (المجموع {uploadSummary.total ?? 0}).
                </p>
              )}

              {uploadErrors.length > 0 && (
                <div role="alert">
                  <p className="add-cer-file-error" style={{ marginBottom: '8px' }}>
                    لم يُستورد ملف بيانات الخريجين — الأخطاء ({uploadErrors.length}):
                  </p>
                  <ul
                    style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      margin: '0 0 10px',
                      paddingInlineStart: '20px',
                      color: '#8a1f1f',
                      fontSize: '13px',
                      lineHeight: '1.9',
                    }}
                  >
                    {uploadErrors.slice(0, 50).map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                  {uploadErrors.length > 50 && (
                    <p className="add-cer-hint">و{uploadErrors.length - 50} خطأ إضافي — أصلح الملف أو الكليات أولاً.</p>
                  )}
                  <button
                    type="button"
                    className="add-cer-btn-submit"
                    onClick={handleRetryUpload}
                    disabled={retryingUpload || !dataFile}
                  >
                    <span>{retryingUpload ? 'جارٍ إعادة المحاولة...' : 'إعادة محاولة رفع الملف'}</span>
                    <span className="add-cer-symbol" style={{ fontSize: '18px' }}>refresh</span>
                  </button>
                </div>
              )}

              <div className="add-cer-columns">
                <span className="add-cer-hint">
                  يُقبل ملف شؤون الطلبة بترتيبه الثابت، ويبقى عمود «الاسم الكامل» مدعوماً. الأعمدة المطلوبة بالسطر الأول (بنفس التسمية تماماً):
                </span>
                <div className="add-cer-col-chips">
                  {REQUIRED_COLUMNS.map((col) => (
                    <span key={col} className="add-cer-col-chip">{col}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="add-cer-divider"></div>

            {/* رسالة الخطأ العامة */}
            {submitError && (
              <div className="add-cer-file-error" role="alert" style={{ marginBottom: '12px' }}>
                {submitError}
              </div>
            )}

            {/* الأزرار */}
            <div className="add-cer-form-footer">
              <button type="button" className="add-cer-btn-cancel" onClick={onCancel}>
                إلغاء والعودة لقائمة الحفلات
              </button>

              <button
                type="submit"
                className="add-cer-btn-submit"
                disabled={submitting || retryingUpload || uploadErrors.length > 0}
              >
                <span>{submitting ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ ونشر الحفل الجديد'}</span>
                <span className="add-cer-symbol" style={{ fontSize: '20px' }}>cloud_upload</span>
              </button>
            </div>
          </form>
        </div>

        {children}

        <p className="add-cer-footer-note">
          <span className="add-cer-symbol">verified_user</span>
          <span>منظومة إدارة التذاكر الموحدة — جامعة حمص</span>
        </p>
      </main>
    </div>
  );
}



