import React, { useState, useEffect } from 'react';
import '../../style/AdminAddCeremony.css';
import AdminSidebar from '../../components/AdminSidebar';
import { createAdminEvent, updateAdminEvent } from './hooks/useAdminEvents.js';
import { ApiError, listColleges, listUniversityFiles, linkUniversityFile, adminBlob, downloadBlob } from '../../api/admin.js';
import useFormDraft from '../../hooks/useFormDraft';
import CollegeCatalogField from '../../components/CollegeCatalogField';
import { BATCH_BADGE } from '../../config/brand';

/* مفاتيح مسودة نموذج الحفل الجديد (localStorage) */
const CEREMONY_DRAFT_KEYS = [
  'name',
  'date',
  'start',
  'end',
  'whatsapp',
  'packages',
  'collegeIds',
].map((k) => `adm.cer.${k}`);

function clearCeremonyDrafts() {
  try {
    CEREMONY_DRAFT_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* التخزين غير متاح، نتجاهل */
  }
}

/* باقات المرافقين: كل بند = { id, companions (عدد المرافقين), price (السعر كنص) } */
const newPackageId = () => `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const makePackage = (companions = '2', price = '') => ({
  id: newPackageId(),
  companions,
  price,
});

/* باقة بديلة ثابتة: بتضمن وجود بطاقة واحدة على الأقل حتى لو المسودة فاضية */
const FALLBACK_PACKAGE = { id: 'pkg-fallback', companions: '2', price: '' };

/* مقارنة مجموعتَي معرّفات بغض النظر عن الترتيب */
const sameIdSet = (a, b) => {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  return left.every((id) => right.includes(id));
};

/* تحويل الباقات القادمة من الخادم (أو من المسودة) إلى الشكل المحلي */
const toLocalPackages = (list) => {
  const source = Array.isArray(list) ? list : [];
  const items = source
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: p.id || newPackageId(),
      companions: String(p.companions ?? p.companions_count ?? ''),
      price: p.price != null && p.price !== '' ? String(p.price) : '',
    }));
  return items.length ? items : [makePackage()];
};

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
}) {
  const isEdit = !!ceremony;
  // الحفل الجديد يحفظ مسودة في localStorage؛ التعديل لا يحفظ مسودة.
  const draftKey = (name) => (isEdit ? null : `adm.cer.${name}`);

  const [ceremonyName, setCeremonyName] = useFormDraft(
    draftKey('name'),
    ceremony?.ceremonyName || '',
    { storage: 'local' },
  );
  const [ceremonyDate, setCeremonyDate] = useFormDraft(
    draftKey('date'),
    ceremony?.ceremonyDate || '',
    { storage: 'local' },
  );
  const [startDate, setStartDate] = useFormDraft(
    draftKey('start'),
    ceremony?.startDate || '',
    { storage: 'local' },
  );
  const [endDate, setEndDate] = useFormDraft(
    draftKey('end'),
    ceremony?.endDate || '',
    { storage: 'local' },
  );
  const [whatsappLink, setWhatsappLink] = useFormDraft(
    draftKey('whatsapp'),
    ceremony?.whatsappLink || '',
    { storage: 'local' },
  );
  const [packages, setPackages] = useFormDraft(
    draftKey('packages'),
    toLocalPackages(ceremony?.packages),
    { storage: 'local' },
  );

  // قائمة الباقات المعروضة (دايماً فيها بند واحد على الأقل)
  const packageList =
    Array.isArray(packages) && packages.length > 0 ? packages : [FALLBACK_PACKAGE];
  const [fieldErrors, setFieldErrors] = useState({});
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة

  // ملفات بيانات الخريجين المرفوعة سابقاً (لربط أحدها بالحفل)
  const [dataFiles, setDataFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkNotice, setLinkNotice] = useState('');
  const [linkErrors, setLinkErrors] = useState([]);

  // تصدير الأسماء المسجّلة إلى Excel
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');

  // تحميل قائمة ملفات بيانات الخريجين
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await listUniversityFiles();
        const items = Array.isArray(res) ? res : res?.items || [];
        if (!alive) return;
        setDataFiles(items);
        // في وضع التعديل: preselect الملف المرتبط بهذا الحفل
        if (isEdit && eventId != null) {
          const linked = items.find((f) => String(f.event_id) === String(eventId));
          if (linked) setSelectedFileId(String(linked.id));
        }
      } catch {
        if (alive) setFilesError('تعذّر تحميل ملفات بيانات الخريجين.');
      } finally {
        if (alive) setFilesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isEdit, eventId]);

  // كتالوج الكليات المركزي (يُحمّل مرة واحدة عند فتح النموذج)
  const [catalogColleges, setCatalogColleges] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listColleges();
        const items = Array.isArray(data) ? data : data?.items || [];
        if (alive) setCatalogColleges(items.filter((c) => c && c.id != null));
      } catch {
        if (alive) setCatalogColleges([]);
      } finally {
        if (alive) setCatalogLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const [selectedCollegeIds, setSelectedCollegeIds] = useFormDraft(
    draftKey('collegeIds'),
    isEdit ? ceremony?.collegeIds || [] : [],
    { storage: 'local' },
  );
  const [collegeError, setCollegeError] = useState('');

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleCollegeToggle = (id) => {
    setCollegeError('');
    setSelectedCollegeIds((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    });
  };

  const handleCollegeRemove = (id) => {
    setCollegeError('');
    setSelectedCollegeIds((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((x) => x !== id);
    });
  };

  // أسماء الكليات المختارة (للموجودين في الكتالوج)
  const selectedCollegeNames = () => {
    const ids = Array.isArray(selectedCollegeIds) ? selectedCollegeIds : [];
    return catalogColleges.filter((c) => ids.includes(c.id)).map((c) => c.name);
  };

  // مسح المسودة المحفوظة والرجوع إلى نموذج فارغ (لإنشاء حفل جديد فقط)
  const handleClearDraft = () => {
    if (!window.confirm('هل تريد مسح المسودة الحالية والبدء بحفل جديد فارغ؟')) return;
    clearCeremonyDrafts();
    setCeremonyName('');
    setCeremonyDate('');
    setStartDate('');
    setEndDate('');
    setWhatsappLink('');
    setPackages([makePackage()]);
    setSelectedCollegeIds([]);
    setFieldErrors({});
    setSubmitError('');
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

  // الباقات مقفلة بعد بدء التسجيل (نفس قيد الخادم FR-16)
  const packagesLocked = isEdit && registrationStarted;

  const addPackage = () => {
    setPackages((prev) => {
      const list = Array.isArray(prev) && prev.length > 0 ? prev : [FALLBACK_PACKAGE];
      const used = new Set(list.map((p) => Number(p.companions)));
      let next = 2;
      while (used.has(next) && next < 10) next += 1;
      return [...list, makePackage(String(Math.min(next, 10)))];
    });
  };

  const removePackage = (id) => {
    setPackages((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      if (list.length <= 1) return list;
      return list.filter((p) => p.id !== id);
    });
  };

  const updatePackage = (id, key, value) => {
    setPackages((prev) => {
      const list = Array.isArray(prev) && prev.length > 0 ? prev : [FALLBACK_PACKAGE];
      return list.map((p) => (p.id === id ? { ...p, [key]: value } : p));
    });
  };

  // التحقق من الباقات قبل الإرسال (نفس قيود الخادم: من ٢ إلى ١٠ مرافقين بدون تكرار)
  const packagesPayload = () => {
    const list = packageList;
    const errors = [];
    const seen = new Set();
    if (list.length === 0) {
      errors.push('لازم تضيف باقة مرافقين واحدة على الأقل.');
    }
    list.forEach((p, index) => {
      const count = Number(p.companions);
      if (!Number.isInteger(count) || count < 2 || count > 10) {
        errors.push(`الباقة ${index + 1}: عدد المرافقين لازم يكون بين ٢ و ١٠.`);
      } else if (seen.has(count)) {
        errors.push(`الباقة ${index + 1}: عدد المرافقين مكرّر (${count}).`);
      } else {
        seen.add(count);
      }
      if (priceToNum(p.price) < 0) {
        errors.push(`الباقة ${index + 1}: السعر ما بيقبل قيمة سالبة.`);
      }
    });
    return {
      errors,
      payload: list.map((p) => ({
        companions_count: Number(p.companions),
        price: priceToNum(p.price),
      })),
    };
  };

  // ربط ملف بيانات خريجين بالحفل: الملف ممكن يكون مرتبط بحفل تاني، فبنأكد قبل النقل
  const confirmReassign = (file) => {
    if (!file || file.event_id == null) return true;
    if (isEdit && String(file.event_id) === String(eventId)) return true;
    return window.confirm(
      `الملف «${file.original_name}» مرتبط حالياً بحفل تاني. ربطه بهاد الحفل بينقل بيانات الخريجين ويلغي ارتباطه بالحفل السابق.\nهل تريد المتابعة؟`,
    );
  };

  const linkSelectedFile = async (fileId, targetEventId, { skipConfirm = false } = {}) => {
    const file = dataFiles.find((f) => String(f.id) === String(fileId));
    if (!file || targetEventId == null) return false;
    if (!skipConfirm && !confirmReassign(file)) return false;

    setLinkBusy(true);
    setFilesError('');
    setLinkNotice('');
    setLinkErrors([]);
    try {
      const res = await linkUniversityFile(Number(fileId), Number(targetEventId));
      const errors = Array.isArray(res?.errors) ? res.errors : [];
      setDataFiles((prev) =>
        prev.map((f) =>
          String(f.id) === String(fileId)
            ? { ...f, event_id: Number(targetEventId), status: errors.length ? 'failed' : 'imported' }
            : f,
        ),
      );
      if (errors.length > 0) {
        setLinkErrors(errors);
        setFilesError(`لم يتم الاستيراد: ${errors.length} أخطاء`);
        return false;
      }
      const imp = res?.import;
      if (imp) {
        setLinkNotice(
          `أُضيف ${imp.added ?? 0}، حُدّث ${imp.updated ?? 0}، تُجوهل ${imp.skipped ?? 0} من أصل ${imp.total ?? 0}`,
        );
      } else {
        setLinkNotice(`تم ربط الملف «${file.original_name}» بالحفل واستيراد بيانات الخريجين تبعا له.`);
      }
      return true;
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status >= 500
          ? `حدث خطأ في الخادم (${err.status}). أرسل وقت المحاولة للدعم. ${new Date().toISOString()}`
          : err instanceof ApiError && err.message
          ? err.message
          : 'تعذّر ربط الملف بالحفل.';
      setFilesError(msg);
      return false;
    } finally {
      setLinkBusy(false);
    }
  };

  // اختيار الملف من القائمة: بالحفل الجديد بينربط بعد الحفظ، وبالتعديل بينربط فوراً
  const handleFileSelect = async (e) => {
    const value = e.target.value;
    if (!value) return;
    const previous = selectedFileId;
    setSelectedFileId(value);
    if (isEdit && eventId != null) {
      const ok = await linkSelectedFile(value, eventId);
      if (!ok) setSelectedFileId(previous);
      return;
    }
    // الحفل الجديد: نتأكد هون إن الملف مش مرتبط بحفل تاني، والربط بيصير بعد الحفظ
    const file = dataFiles.find((f) => String(f.id) === String(value));
    if (file && file.event_id != null && !confirmReassign(file)) {
      setSelectedFileId(previous);
    }
  };

  // تصدير الأسماء المسجّلة على الموقع إلى Excel
  const handleExportExcel = async () => {
    setExportError('');
    setExportBusy(true);
    try {
      const query = isEdit && eventId != null ? { event_id: eventId } : {};
      const { blob, filename } = await adminBlob('/api/admin/export', query);
      downloadBlob(blob, filename);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'تعذّر تصدير الملف، حاول لاحقاً.');
    } finally {
      setExportBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setFieldErrors({});
    setCollegeError('');

    if (catalogLoading) {
      setSubmitError('جارٍ تحميل قائمة الكليات، حاول بعد لحظات.');
      return;
    }

    const collegeNames = selectedCollegeNames();
    if (collegeNames.length === 0) {
      setSubmitError('اختر كلية واحدة على الأقل لهذا الحفل');
      return;
    }

    const collegesChanged =
      isEdit && !sameIdSet(selectedCollegeIds, ceremony?.collegeIds || []);

    const { errors: pkgErrors, payload: pkgPayload } = packagesPayload();
    if (pkgErrors.length > 0) {
      setSubmitError(pkgErrors.join(' '));
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
    };

    try {
      setSubmitting(true);
      let result;
      if (isEdit) {
        const payload = { ...base };
        // الباقات ما بتتعدّل بعد بدء التسجيل (الخادم بيرفض الطلب عندها)
        if (!packagesLocked) payload.packages = pkgPayload;
        // نرسل الكليات فقط إذا تغيّرت القائمة، حتى ما نلمسها بطلب لا يخصها
        if (collegesChanged) payload.college_names = collegeNames;
        result = await updateAdminEvent(eventId, payload);
      } else {
        result = await createAdminEvent({
          ...base,
          packages: pkgPayload,
          college_names: collegeNames,
        });
      }

      const id = eventId ?? result?.id ?? result?.event_id;

      // ربط ملف بيانات الخريجين بالحفل الجديد (بعد ما ينشأ الحفل ويصير له رقم)
      if (!isEdit && selectedFileId && id != null) {
        await linkSelectedFile(selectedFileId, id, { skipConfirm: true });
      }

      clearCeremonyDrafts();
      if (onSubmitSuccess) {
        onSubmitSuccess(result);
      } else {
        alert(isEdit ? 'تم حفظ التعديلات بنجاح!' : 'تم حفظ ونشر الحفل الجديد بنجاح!');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
        setSubmitError('يرجى تصحيح الحقول المميّزة بالأحمر ثم إعادة المحاولة.');
      } else if (collegesChanged && err instanceof ApiError && err.status === 409) {
        setCollegeError(err.message || 'تعذّر تعديل كليات الحفل.');
      } else {
        setSubmitError(
          err instanceof ApiError && err.status >= 500
            ? `حدث خطأ في الخادم (${err.status}). أرسل وقت المحاولة للدعم. ${new Date().toISOString()}`
            : err instanceof ApiError && err.message
            ? err.message
            : 'حدث خطأ غير متوقع.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-cer-app-container">
      {/* الخط التزييني العلوي */}
      <div className="add-cer-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="ceremonies"
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
                    ? 'عدّل بيانات الحفل والكليات المرتبطة به، مع مراعاة شروط الإضافة والإزالة.'
                    : 'عبّي بيانات الفوج الجديد برواق، وبتنزل التذاكر فوراً عالمنظومة للطلاب.'}
                </p>
              </div>
            </div>

            <div className="add-cer-header-tags">
              <span className="add-cer-tag-pill">
                <span className="add-cer-tag-dot"></span>
                <span>مسودة غير منشورة</span>
              </span>

              <button
                type="button"
                className="add-cer-export-btn"
                onClick={handleExportExcel}
                disabled={exportBusy}
                title={
                  isEdit
                    ? 'تنزيل أسماء الخريجين المسجّلين في هذا الحفل (Excel)'
                    : 'تنزيل كل الأسماء المسجّلة على الموقع (Excel)'
                }
              >
                <span className="add-cer-symbol" style={{ fontSize: '16px' }}>table_chart</span>
                <span>{exportBusy ? 'جارٍ التصدير...' : 'تصدير Excel'}</span>
              </button>

              {!isEdit && (
                <button type="button" className="add-cer-draft-clear" onClick={handleClearDraft}>
                  <span className="add-cer-symbol" style={{ fontSize: '16px' }}>delete_sweep</span>
                  <span>مسح المسودة</span>
                </button>
              )}
            </div>
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
                  placeholder={`مثال: حفل كليات الهندسة — ${BATCH_BADGE}`}
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
                  {isEdit
                    ? 'أضف كلية جديدة، أو أزل كلية لا يوجد فيها خريجون مسجّلون بهذا الحفل'
                    : 'حدد الكليات المشمولة بهذا الفوج للتوزيع على المدرج'}
                </span>
              </div>

              <CollegeCatalogField
                colleges={catalogColleges}
                selectedIds={selectedCollegeIds}
                onToggle={handleCollegeToggle}
                onRemove={isEdit ? handleCollegeRemove : undefined}
                loading={catalogLoading}
                error={collegeError || errFor('college_names') || errFor('colleges')}
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
                    حدّد عدد المرافقين وسعر كل باقة، والباقة تطلع للطالب أثناء الحجز.
                  </p>
                </div>
                <span className="add-cer-currency">العملة: ليرة سورية (ل.س)</span>
              </div>

              <div className="add-cer-pkg-list">
                {packageList.map((pkg, index) => (
                  <div className="add-cer-pkg-card" key={pkg.id}>
                    <div className="add-cer-pkg-head">
                      <div className="add-cer-pkg-title">
                        <span className="add-cer-symbol" style={{ color: '#124d44' }}>confirmation_number</span>
                        <span>مرافقين</span>
                      </div>
                      <div className="add-cer-pkg-actions">
                        <span className="add-cer-pkg-badge green">{`باقة ${index + 1}`}</span>
                        {packageList.length > 1 && (
                          <button
                            type="button"
                            className="add-cer-pkg-icon-btn"
                            onClick={() => removePackage(pkg.id)}
                            aria-label="حذف الباقة"
                            title="حذف الباقة"
                            disabled={packagesLocked}
                          >
                            <span className="add-cer-symbol" style={{ fontSize: '16px' }}>close</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="add-cer-pkg-icon-btn add"
                          onClick={addPackage}
                          aria-label="إضافة باقة مرافقين"
                          title="إضافة باقة مرافقين"
                          disabled={packagesLocked}
                        >
                          <span className="add-cer-symbol" style={{ fontSize: '16px' }}>add</span>
                        </button>
                      </div>
                    </div>

                    <div className="add-cer-pkg-fields">
                      <div className="add-cer-field-group">
                        <label className="add-cer-label" htmlFor={`pkg-companions-${pkg.id}`}>
                          عدد المرافقين
                        </label>
                        <input
                          id={`pkg-companions-${pkg.id}`}
                          type="number"
                          min="2"
                          max="10"
                          step="1"
                          inputMode="numeric"
                          className="add-cer-input add-cer-count-input"
                          value={pkg.companions}
                          onChange={(e) => updatePackage(pkg.id, 'companions', e.target.value)}
                          placeholder="2"
                          disabled={packagesLocked}
                          required
                        />
                      </div>

                      <div className="add-cer-field-group">
                        <label className="add-cer-label" htmlFor={`pkg-price-${pkg.id}`}>
                          سعر الباقة
                        </label>
                        <div className="add-cer-input-wrap">
                          <input
                            id={`pkg-price-${pkg.id}`}
                            type="text"
                            inputMode="numeric"
                            className="add-cer-input add-cer-price-input"
                            value={pkg.price}
                            onChange={(e) => updatePackage(pkg.id, 'price', e.target.value)}
                            placeholder="مثال: 125,000"
                            disabled={packagesLocked}
                            required
                          />
                          <span className="add-cer-price-unit">ل.س</span>
                        </div>
                      </div>
                    </div>

                    <p className="add-cer-hint">تشمل روب التخرج + شهادة الحفل + مقاعد المرافقين بالمدرج.</p>
                  </div>
                ))}
              </div>

              {packagesLocked && (
                <span className="add-cer-warn-pill">
                  <span className="add-cer-symbol">warning</span>
                  <span>ملاحظة: ما بيتغيّر بعد بدء التسجيل</span>
                </span>
              )}

              {(errFor('packages') || errFor('companions_count') || errFor('price')) && (
                <p className="add-cer-file-error" role="alert">
                  {errFor('packages') || errFor('companions_count') || errFor('price')}
                </p>
              )}
            </div>

            <div className="add-cer-divider"></div>

            {/* ملف بيانات الخريجين */}
            <div className="add-cer-field-group" style={{ gap: '12px' }}>
              <div className="add-cer-section-head">
                <div>
                  <h4 className="add-cer-section-title">
                    <span className="add-cer-symbol">upload_file</span>
                    <span>ملف بيانات الخريجين</span>
                  </h4>
                  <p className="add-cer-hint" style={{ marginTop: '2px' }}>
                    اختار الملف يلي رفعته بصفحة «ملفات البيانات» وربطو بهاد الحفل، وبتتم استيراد أسماء الخريجين تبعا لو فوراً.
                  </p>
                </div>
              </div>

              <select
                className="add-cer-input add-cer-select"
                value={selectedFileId}
                onChange={handleFileSelect}
                disabled={linkBusy || filesLoading}
                aria-label="ملف بيانات الخريجين"
              >
                <option value="">
                  {filesLoading ? 'جارٍ تحميل الملفات...' : 'بدون ملف بيانات'}
                </option>
                {dataFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {`${f.original_name} · ${f.rows_total} صف${f.event_id ? ' · مرتبط بحفل' : ''}`}
                  </option>
                ))}
              </select>

              {linkNotice && (
                <p className="add-cer-hint with-icon" style={{ color: '#1b7a4b' }}>
                  <span className="add-cer-symbol">check_circle</span>
                  <span>{linkNotice}</span>
                </p>
              )}

              {filesError && (
                <p className="add-cer-file-error" role="alert">{filesError}</p>
              )}

              {linkErrors.length > 0 && (
                <div className="add-cer-file-error" role="alert" style={{ marginTop: '8px' }}>
                  <p style={{ fontWeight: 'bold', margin: '0 0 8px' }}>
                    لم يتم الاستيراد: {linkErrors.length} أخطاء
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' }}>الصف</th>
                          <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' }}>الحقل</th>
                          <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' }}>المشكلة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linkErrors.slice(0, 50).map((e, i) => (
                          <tr key={i}>
                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{e?.row ?? '—'}</td>
                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{e?.field ?? '—'}</td>
                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{e?.message ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {linkErrors.length > 50 && (
                    <p style={{ margin: '8px 0' }}>و {linkErrors.length - 50} خطأ آخر</p>
                  )}
                </div>
              )}

              {exportError && (
                <p className="add-cer-file-error" role="alert">{exportError}</p>
              )}

              <p className="add-cer-hint with-icon">
                <span className="add-cer-symbol">info</span>
                <span>
                  {isEdit
                    ? 'الملف بيتربط بالحفل مباشرة وبتستورد بياناتو فوراً.'
                    : 'الحفل الجديد بينحفظ أولاً، وبعدها بينربط الملف المختار، أو بينحفظ بدون ملف بيانات.'}
                </span>
              </p>
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
                disabled={submitting}
              >
                <span>{submitting ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ ونشر الحفل الجديد'}</span>
                <span className="add-cer-symbol" style={{ fontSize: '20px' }}>cloud_upload</span>
              </button>
            </div>
          </form>
        </div>

        <p className="add-cer-footer-note">
          <span className="add-cer-symbol">verified_user</span>
          <span>منظومة إدارة التذاكر الموحدة — جامعة حمص</span>
        </p>
      </main>
    </div>
  );
}



