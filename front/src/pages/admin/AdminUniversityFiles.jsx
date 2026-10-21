import React, { useCallback, useEffect, useRef, useState } from 'react';
import '../../style/AdminDashboard.css';
import '../../style/AdminUniversityFiles.css';
import AdminSidebar from '../../components/AdminSidebar';
import {
  listUniversityFiles,
  uploadUniversityFile,
  linkUniversityFile,
  deleteUniversityFile,
  getEvents,
  ApiError,
} from '../../api/admin.js';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_SIZE_MB = 25;

const STATUS_LABELS = {
  uploaded: 'مرفوع بدون ربط',
  imported: 'مستورد',
  failed: 'فشل الاستيراد',
};

function formatSize(bytes) {
  if (bytes == null) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} ميغابايت`;
  return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}

export default function AdminUniversityFiles({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [uploadEventId, setUploadEventId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const [linkingId, setLinkingId] = useState(null);
  const [linkEventId, setLinkEventId] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  const loadFiles = useCallback(() => {
    setLoading(true);
    listUniversityFiles()
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items || [];
        setFiles(items);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'تعذّر تحميل ملفات البيانات.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancel = false;
    loadFiles();
    getEvents({ limit: 100 })
      .then((res) => {
        if (cancel) return;
        const items = Array.isArray(res) ? res : res?.items || [];
        setEvents(items);
      })
      .catch(() => {
        /* قائمة الحفلات اختيارية للعرض فقط */
      });
    return () => {
      cancel = true;
    };
  }, [loadFiles]);

  const eventName = useCallback(
    (id) => events.find((ev) => String(ev.id) === String(id))?.name || `حفل #${id}`,
    [events]
  );

  const validateFile = (file) => {
    if (!file) return 'اختر ملفاً أولاً.';
    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return 'صيغة الملف غير مدعومة. المسموح: xlsx أو xls أو csv.';
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `حجم الملف يتجاوز الحد المسموح (${MAX_SIZE_MB} ميغابايت).`;
    }
    return '';
  };

  const handleUpload = async (file) => {
    const invalid = validateFile(file);
    if (invalid) {
      setUploadError(invalid);
      return;
    }
    setBusy(true);
    setUploadError('');
    try {
      await uploadUniversityFile(file, uploadEventId || null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadFiles();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'تعذّر رفع الملف.');
    } finally {
      setBusy(false);
      setDragOver(false);
    }
  };

  const handleLink = async (fileId) => {
    if (!linkEventId) {
      setError('اختر الحفل الذي تريد ربط الملف به.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await linkUniversityFile(fileId, Number(linkEventId));
      setLinkingId(null);
      setLinkEventId('');
      loadFiles();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر ربط الملف بالحفل.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (fileId) => {
    setBusy(true);
    setError('');
    try {
      await deleteUniversityFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حذف الملف.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-app-container">
      <div className="adm-top-accent"></div>

      <AdminSidebar
        activeId="files"
        currentId="files"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      <header className="adm-topbar">
        <button
          type="button"
          className="adm-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="adm-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="adm-topbar-title">
          <h2>ملفات البيانات</h2>
          <span>جامعة حمص</span>
        </div>

        <button
          type="button"
          className="uf-back-btn"
          onClick={() => onNavigate && onNavigate('dashboard')}
        >
          <span className="adm-symbol" style={{ fontSize: '18px' }}>arrow_forward</span>
          <span className="uf-back-text">العودة إلى لوحة الإحصائيات</span>
        </button>
      </header>

      <main className="adm-main-canvas">
        <section className="uf-hero">
          <h3 className="uf-hero-title">مركز ملفات البيانات</h3>
          <p className="uf-hero-sub">
            ارفع ملفات بيانات الخريجين هنا، ثم اربط كل ملف بالحفل المناسب. يظهر لكل ملف الحفل المرتبط والكليات الموجودة داخله وعدد الصفوف المستوردة.
          </p>
        </section>

        {error && (
          <p className="uf-error" role="alert">{error}</p>
        )}

        <section className="uf-card">
          <h4 className="uf-title">رفع ملف جديد</h4>

          <div className="uf-upload-row">
            <label className="uf-field">
              <span className="uf-field-label">ربط اختياري بحفل</span>
              <select
                className="uf-select"
                value={uploadEventId}
                onChange={(e) => setUploadEventId(e.target.value)}
              >
                <option value="">بدون ربط (اربطه لاحقاً)</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div
            className={`uf-drop ${dragOver ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files && e.dataTransfer.files[0];
              if (file) handleUpload(file);
            }}
          >
            <span className="adm-symbol uf-drop-icon">upload_file</span>
            <p className="uf-drop-text">اسحب الملف هنا أو اختره من جهازك</p>
            <p className="uf-drop-hint">
              الصيغ المسموحة: xlsx / xls / csv — الحد الأقصى {MAX_SIZE_MB} ميغابايت
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="uf-file-input"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                if (file) handleUpload(file);
              }}
            />
            <button
              type="button"
              className="uf-btn primary"
              disabled={busy}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              اختيار ملف
            </button>
          </div>

          {uploadError && (
            <p className="uf-error" role="alert">{uploadError}</p>
          )}
        </section>

        <section className="uf-list-wrap">
          <h4 className="uf-title">الملفات المرفوعة</h4>

          {loading ? (
            <p className="uf-empty">جارٍ تحميل الملفات...</p>
          ) : files.length === 0 ? (
            <p className="uf-empty">لا توجد ملفات بعد. ارفع أول ملف من الأعلى.</p>
          ) : (
            <div className="uf-list">
              {files.map((f) => (
                <article key={f.id} className="uf-item">
                  <header className="uf-item-head">
                    <div className="uf-item-main">
                      <span className="adm-symbol uf-item-icon">description</span>
                      <div className="uf-item-info">
                        <span className="uf-item-name" title={f.original_name}>
                          {f.original_name}
                        </span>
                        <span className="uf-item-meta">
                          {formatSize(f.size_bytes)} · {f.rows_total} صف
                        </span>
                      </div>
                    </div>
                    <span className={`uf-badge ${f.status}`}>
                      {STATUS_LABELS[f.status] || f.status}
                    </span>
                  </header>

                  <div className="uf-item-body">
                    <div className="uf-item-line">
                      <span className="uf-item-key">الحفل المرتبط:</span>
                      <span className="uf-item-val">
                        {f.event_id ? eventName(f.event_id) : 'غير مرتبط'}
                      </span>
                    </div>
                    <div className="uf-item-line">
                      <span className="uf-item-key">الكليات داخل الملف:</span>
                      <span className="uf-item-val">
                        {f.colleges && f.colleges.length > 0
                          ? f.colleges
                              .map((c) => `${c.name} (${c.rows})`)
                              .join('، ')
                          : '—'}
                      </span>
                    </div>
                    <div className="uf-item-line">
                      <span className="uf-item-key">نتيجة الاستيراد:</span>
                      <span className="uf-item-val">
                        مضاف {f.rows_imported} · محدّث {f.rows_updated} · متجاهل {f.rows_skipped}
                      </span>
                    </div>
                  </div>

                  {linkingId === f.id ? (
                    <div className="uf-link-row">
                      <select
                        className="uf-select"
                        value={linkEventId}
                        onChange={(e) => setLinkEventId(e.target.value)}
                      >
                        <option value="">اختر الحفل...</option>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>{ev.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="uf-btn primary"
                        disabled={busy}
                        onClick={() => handleLink(f.id)}
                      >
                        تأكيد الربط
                      </button>
                      <button
                        type="button"
                        className="uf-btn ghost"
                        onClick={() => {
                          setLinkingId(null);
                          setLinkEventId('');
                        }}
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <div className="uf-item-actions">
                      <button
                        type="button"
                        className="uf-btn ghost"
                        onClick={() => {
                          setLinkingId(f.id);
                          setLinkEventId(f.event_id ? String(f.event_id) : '');
                          setConfirmId(null);
                        }}
                      >
                        {f.event_id ? 'إعادة الربط' : 'ربط بحفل'}
                      </button>
                      {confirmId === f.id ? (
                        <>
                          <span className="uf-confirm-text">تأكيد الحذف؟</span>
                          <button
                            type="button"
                            className="uf-btn danger"
                            disabled={busy}
                            onClick={() => handleDelete(f.id)}
                          >
                            حذف
                          </button>
                          <button
                            type="button"
                            className="uf-btn ghost"
                            onClick={() => setConfirmId(null)}
                          >
                            إلغاء
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="uf-btn danger"
                          onClick={() => setConfirmId(f.id)}
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
