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
  downloadBlob,
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
  const [report, setReport] = useState(null);

  const loadFiles = useCallback(() => {
    setLoading(true);
    listUniversityFiles()
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items || [];
        setFiles(items);
      })
      .catch((e) => {
        setError(apiErrorMessage(e, 'تعذّر تحميل ملفات البيانات.'));
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

  const apiErrorMessage = (err, fallback) => {
    if (err instanceof ApiError) {
      if (err.status >= 500) {
        return `حدث خطأ في الخادم (${err.status}). أرسل وقت المحاولة للدعم. ${new Date().toISOString()}`;
      }
      if (err.message) return err.message;
    }
    return fallback;
  };

  const buildReport = (res) => {
    const errors = Array.isArray(res?.errors) ? res.errors : [];
    if (errors.length > 0) {
      return { type: 'error', errors };
    }
    const imp = res?.import;
    if (imp) {
      return {
        type: 'success',
        added: imp.added ?? 0,
        updated: imp.updated ?? 0,
        skipped: imp.skipped ?? 0,
        total: imp.total ?? 0,
      };
    }
    return null;
  };

  const downloadErrorsCsv = (errors) => {
    const rows = [['الصف', 'الحقل', 'المشكلة']];
    for (const e of errors) {
      rows.push([e?.row ?? '', e?.field ?? '', e?.message ?? '']);
    }
    const csv = rows
      .map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'upload-errors.csv');
  };

  const handleUpload = async (file) => {
    const invalid = validateFile(file);
    if (invalid) {
      setUploadError(invalid);
      return;
    }
    setBusy(true);
    setUploadError('');
    setReport(null);
    try {
      const res = await uploadUniversityFile(file, uploadEventId || null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadFiles();
      const r = buildReport(res);
      if (r) setReport(r);
    } catch (err) {
      setUploadError(apiErrorMessage(err, 'تعذّر رفع الملف.'));
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
    setReport(null);
    try {
      const res = await linkUniversityFile(fileId, Number(linkEventId));
      setLinkingId(null);
      setLinkEventId('');
      loadFiles();
      const r = buildReport(res);
      if (r) setReport(r);
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر ربط الملف بالحفل.'));
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
      setError(apiErrorMessage(err, 'تعذّر حذف الملف.'));
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

          {report && report.type === 'error' && (
            <div className="uf-error" role="alert" style={{ marginTop: '12px' }}>
              <p style={{ fontWeight: 'bold', margin: '0 0 8px' }}>
                لم يتم الاستيراد: {report.errors.length} أخطاء
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
                    {report.errors.slice(0, 50).map((e, i) => (
                      <tr key={i}>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{e?.row ?? '—'}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{e?.field ?? '—'}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{e?.message ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.errors.length > 50 && (
                <p style={{ margin: '8px 0' }}>و {report.errors.length - 50} خطأ آخر</p>
              )}
              <button
                type="button"
                className="uf-btn ghost"
                onClick={() => downloadErrorsCsv(report.errors)}
                style={{ marginTop: '8px' }}
              >
                تنزيل الأخطاء (CSV)
              </button>
            </div>
          )}

          {report && report.type === 'success' && (
            <div
              role="status"
              style={{
                marginTop: '12px',
                padding: '10px 12px',
                background: '#eaf6ef',
                color: '#1b7a4b',
                borderRadius: '8px',
                fontWeight: 'bold',
              }}
            >
              أُضيف {report.added}، حُدّث {report.updated}، تُجوهل {report.skipped} من أصل {report.total}
            </div>
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
