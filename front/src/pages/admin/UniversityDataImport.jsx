import React, { useState, useRef } from 'react';
import '../../style/UniversityDataImport.css';

/* ==========================================================================
   استيراد وتحديث بيانات الخريجين (تبويب داخل "الماسحون والإعدادات")
   يستخدم كلاسات البطاقات والأزرار من AdminScannersSettings.css (scan-set-*)
   ========================================================================== */

const REQUIRED_COLUMNS = ['الرقم الجامعي', 'الاسم الكامل', 'اسم الأب', 'اسم الأم', 'الكلية', 'الجنس'];
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_SIZE_MB = 25;

/*
  نتيجة تدقيق تجريبية: لما يجهز الباك إند مرّر دالة onAnalyze(file) ترجع:
  { total: عدد السجلات الصحيحة, errors: [{ line, name, id, faculty, errorType, icon, actionText }] }
*/
const MOCK_ERRORS = [
  {
    line: '142',
    name: 'كنان محمد العلي',
    id: 'ENG-88291',
    faculty: 'الهندسة الميكانيكية والكهربائية',
    errorType: 'رقم جامعي مكرر',
    icon: 'error',
    actionText: 'دمج السجل وتحديث البيانات',
  },
  {
    line: '419',
    name: 'سارة غسان الصالح',
    id: 'SCI-10492',
    faculty: 'كلية العلوم الأولى (اسم غير قياسي)',
    errorType: 'الكلية غير مطابقة',
    icon: 'warning',
    actionText: 'تعيين إلى: كلية العلوم',
  },
  {
    line: '803',
    name: 'مروان عبد الرحمن يوسف',
    id: 'DEN-44012',
    faculty: 'كلية طب الأسنان',
    errorType: 'حقل اسم الأم مفقود',
    icon: 'help',
    actionText: 'استيراد مع وسمه للتحديث لاحقاً',
  },
];

const MOCK_AUDIT = { total: 1420, errors: MOCK_ERRORS };

/* ملف تجريبي ظاهر من البداية (للمعاينة فقط) */
const SAMPLE_FILE = {
  name: 'AlBaath_Graduates_Batch2024_FacultyEngineering_Draft.xlsx',
  size: 1.4 * 1024 * 1024,
};

async function mockAnalyze() {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return MOCK_AUDIT;
}

const formatSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const fmt = (n) => n.toLocaleString('en-US');

/* ملف CSV فارغ بالأعمدة الإلزامية (يفتح مباشرة في Excel) */
function downloadTemplate() {
  const header = REQUIRED_COLUMNS.join(',');
  const blob = new Blob([`﻿${header}\n`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'graduates-template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/*
  showSample: يعرض ملف وجدول تدقيق تجريبيين من البداية (للمعاينة والتصميم).
  لما يجهز الباك إند حطّها false، فبيظهر الجدول بعد رفع ملف حقيقي فقط.
*/
export default function UniversityDataImport({
  onAnalyze = mockAnalyze,
  onApprove,
  onNotice,
  showSample = true,
}) {
  const [file, setFile] = useState(showSample ? SAMPLE_FILE : null);
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState(showSample ? 'ready' : 'idle'); // idle | analyzing | ready | approving | done
  const [audit, setAudit] = useState(showSample ? MOCK_AUDIT : { total: 0, errors: [] });
  const [resolved, setResolved] = useState({}); // { [line]: true }
  const inputRef = useRef(null);

  const unresolved = audit.errors.filter((e) => !resolved[e.line]);

  const validateFile = (f) => {
    const name = f.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return 'صيغة الملف غير مدعومة، المسموح: xlsx أو xls أو csv';
    }
    if (f.size === 0) return 'الملف فارغ';
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return `حجم الملف يتجاوز ${MAX_SIZE_MB} ميغابايت`;
    return '';
  };

  const reset = () => {
    setFile(null);
    setFileError('');
    setStatus('idle');
    setAudit({ total: 0, errors: [] });
    setResolved({});
  };

  const handleFiles = async (fileList) => {
    const f = fileList && fileList[0];
    if (!f) return;

    const error = validateFile(f);
    if (error) {
      setFileError(error);
      setFile(null);
      setStatus('idle');
      return;
    }

    setFileError('');
    setFile(f);
    setResolved({});
    setStatus('analyzing');
    try {
      const result = await onAnalyze(f);
      setAudit(result);
      setStatus('ready');
    } catch (err) {
      setFileError('تعذّر تحليل الملف، تأكد من الأعمدة وحاول مرة أخرى');
      setStatus('idle');
    }
  };

  const openPicker = () => inputRef.current && inputRef.current.click();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleResolve = (row) => {
    setResolved((prev) => ({ ...prev, [row.line]: true }));
    if (onNotice) onNotice(`تمت المعالجة: ${row.actionText}`);
  };

  const handleApprove = async () => {
    if (status !== 'ready') return;
    setStatus('approving');
    try {
      if (onApprove) {
        await onApprove({
          file,
          imported: audit.total + audit.errors.length - unresolved.length,
          skipped: unresolved.length,
          resolvedLines: Object.keys(resolved),
        });
      }
      setStatus('done');
      if (onNotice) onNotice('تمت معالجة واعتماد بيانات الخريجين وتفعيل رموز QR');
    } catch (err) {
      setStatus('ready');
      if (onNotice) onNotice('تعذّر اعتماد البيانات، حاول مرة أخرى');
    }
  };

  return (
    <div className="uni-data-panel">
      {/* ملاحظة تنظيمية */}
      <div className="uni-data-note">
        <div className="uni-data-note-icon">
          <span className="scan-set-symbol fill">info</span>
        </div>
        <div>
          <h4>ملاحظة تنظيمية هامة</h4>
          <p>
            رفع نسخة جديدة يضيف ويحدّث ولا يحذف خريجين مسجّلين ومؤكدين مسبقاً. الحسابات المحجوزة والمقاعد المخصصة
            تبقى آمنة وثابتة دون تكرار للأرقام الجامعية.
          </p>
        </div>
      </div>

      {/* رفع الملف */}
      <div className="scan-set-card">
        <div className="scan-set-card-head">
          <div className="scan-set-card-title">
            <div className="scan-set-title-icon orange">
              <span className="scan-set-symbol" style={{ fontSize: '22px' }}>cloud_sync</span>
            </div>
            <div>
              <h4>استيراد وتحديث قاعدة بيانات الخريجين</h4>
              <p>تُولَّد أذونات الدخول ورموز QR الرسمية تلقائياً لطلبة كليات جامعة حمص</p>
            </div>
          </div>
          <button type="button" className="scan-set-btn-outline" onClick={downloadTemplate}>
            <span className="scan-set-symbol" style={{ fontSize: '18px' }}>download</span>
            <span>تنزيل نموذج الملف</span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="scan-set-file-input"
          aria-label="اختيار ملف بيانات الخريجين"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = ''; // للسماح باختيار الملف نفسه مرة ثانية
          }}
        />

        <div
          className={`uni-data-dropzone ${dragOver ? 'over' : ''} ${fileError ? 'error' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="اسحب الملف هنا أو اضغط للتصفح"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="uni-data-drop-icon">
            <span className="scan-set-symbol" style={{ fontSize: '32px' }}>upload_file</span>
          </div>
          <p className="uni-data-drop-title">
            اسحب ملف Excel أو CSV وأفلته هنا، أو <span>اضغط للتصفح</span>
          </p>
          <p className="scan-set-hint">
            الصيغ المدعومة: xlsx وxls وcsv — الحجم الأقصى {MAX_SIZE_MB} ميغابايت
          </p>
        </div>

        {fileError && (
          <p className="uni-data-error-text" role="alert">
            {fileError}
          </p>
        )}

        {file && (
          <div className="uni-data-file-chip">
            <span className="scan-set-symbol" style={{ color: '#124d44', fontSize: '18px' }}>attach_file</span>
            <span className="uni-data-file-name">{file.name}</span>
            <span className="uni-data-file-size">({formatSize(file.size)})</span>
            {status === 'analyzing' ? (
              <span className="uni-data-file-state">جارٍ تحليل الملف...</span>
            ) : (
              <span className="scan-set-symbol fill" style={{ color: '#1e8a5a', fontSize: '18px' }}>check_circle</span>
            )}
            <button
              type="button"
              className="uni-data-file-remove"
              aria-label="إزالة الملف"
              onClick={reset}
              disabled={status === 'analyzing' || status === 'approving'}
            >
              <span className="scan-set-symbol" style={{ fontSize: '18px' }}>close</span>
            </button>
          </div>
        )}

        {/* الأعمدة الإلزامية */}
        <div className="uni-data-columns">
          <div className="uni-data-columns-head">
            <h5>
              <span className="scan-set-symbol" style={{ fontSize: '18px' }}>view_column</span>
              الأعمدة الإلزامية في الملف
            </h5>
            <span className="scan-set-hint">يجب مطابقة التسميات في السطر الأول تماماً</span>
          </div>
          <div className="uni-data-chips">
            {REQUIRED_COLUMNS.map((col) => (
              <span key={col} className="uni-data-chip">
                <span className="scan-set-symbol" style={{ fontSize: '14px' }}>pin</span>
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* نتيجة التدقيق */}
      {(status === 'ready' || status === 'approving' || status === 'done') && (
        <div className="scan-set-card flush">
          <div className="scan-set-card-head padded">
            <div className="scan-set-card-title">
              <h4>جدول تدقيق أخطاء الاستيراد قبل الاعتماد</h4>
              <span className={`uni-data-badge ${unresolved.length ? 'warn' : 'ok'}`}>
                {unresolved.length
                  ? `تم اكتشاف ${unresolved.length} تنبيهات بحاجة لمراجعة`
                  : 'لا توجد تنبيهات معلّقة'}
              </span>
            </div>
            <span className="scan-set-hint">إجمالي القيود في الملف: {fmt(audit.total)} سجل ناجح</span>
          </div>

          {audit.errors.length > 0 && (
            <div className="uni-data-table-wrapper">
              <table className="uni-data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>السطر بالملف</th>
                    <th>الاسم المدخل</th>
                    <th>الرقم الجامعي</th>
                    <th>الكلية</th>
                    <th>الخطأ المكتشف</th>
                    <th>الإجراء المقترح</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.errors.map((row) => {
                    const done = !!resolved[row.line];
                    return (
                      <tr key={row.line} className={done ? 'resolved' : ''}>
                        <td style={{ textAlign: 'center' }} className="uni-data-line">{row.line}</td>
                        <td className="uni-data-strong">{row.name}</td>
                        <td dir="ltr" style={{ textAlign: 'right' }}>{row.id}</td>
                        <td>{row.faculty}</td>
                        <td>
                          <span className="uni-data-error-chip">
                            <span className="scan-set-symbol" style={{ fontSize: '16px' }}>{row.icon}</span>
                            <span>{row.errorType}</span>
                          </span>
                        </td>
                        <td>
                          {done ? (
                            <span className="uni-data-done">
                              <span className="scan-set-symbol fill" style={{ fontSize: '16px' }}>check_circle</span>
                              تمت المعالجة
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="uni-data-action-link"
                              disabled={status !== 'ready'}
                              onClick={() => handleResolve(row)}
                            >
                              {row.actionText}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* الاعتماد */}
          <div className="uni-data-approve-bar">
            <div className="uni-data-approve-info">
              <span className="scan-set-symbol fill" style={{ color: '#124d44', fontSize: '20px' }}>verified_user</span>
              <div>
                <p>سيتم التدقيق التلقائي وتفعيل رموز الاستجابة السريعة (QR) فور الضغط على الاعتماد.</p>
                {unresolved.length > 0 && status !== 'done' && (
                  <p className="uni-data-warning">
                    {unresolved.length} سجلات بها أخطاء لم تُعالج ولن تُستورد.
                  </p>
                )}
              </div>
            </div>

            {status === 'done' ? (
              <button type="button" className="scan-set-btn-outline" onClick={reset}>
                <span className="scan-set-symbol" style={{ fontSize: '18px' }}>upload_file</span>
                <span>رفع ملف آخر</span>
              </button>
            ) : (
              <button
                type="button"
                className="scan-set-btn-primary"
                disabled={status !== 'ready'}
                onClick={handleApprove}
              >
                <span>{status === 'approving' ? 'جارٍ الاعتماد...' : 'معالجة واعتماد بيانات الخريجين'}</span>
                <span className="scan-set-symbol" style={{ fontSize: '18px' }}>arrow_back</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}