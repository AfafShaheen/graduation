import React, { useState, useEffect } from 'react';
import '../../style/MajorsManager.css';
import { getMajors, createMajor, updateMajor, deleteMajor, ApiError } from '../../api/admin.js';
import { parseMajorsBatch, resolveBatchGroups } from './majorsBatch.js';

export default function MajorsManager({ colleges = [] }) {
  const [collegeId, setCollegeId] = useState(() => (colleges[0]?.id ? String(colleges[0].id) : ''));
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchResult, setBatchResult] = useState(null);

  useEffect(() => {
    if (colleges.length && !colleges.some((c) => String(c.id) === collegeId)) {
      setCollegeId(String(colleges[0].id));
    }
  }, [colleges, collegeId]);

  useEffect(() => {
    let cancel = false;
    if (!collegeId) {
      setMajors([]);
      return () => {};
    }
    setLoading(true);
    setError('');
    setEditingId(null);
    setConfirmId(null);
    getMajors(collegeId)
      .then((res) => {
        if (cancel) return;
        setMajors(Array.isArray(res) ? res : res?.items || []);
      })
      .catch((e) => {
        if (cancel) return;
        setError(e instanceof ApiError ? e.message : 'تعذّر تحميل التخصصات.');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [collegeId, reloadKey]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      setError('اسم التخصص يجب أن يكون حرفين على الأقل.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await createMajor(collegeId, { name });
      setMajors((prev) => [...prev, created]);
      setNewName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إضافة التخصص.');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkAdd = async () => {
    const parsed = parseMajorsBatch(batchText);
    if (parsed.groups.length === 0) {
      setError('لم يُعثر على أي كلية أو تخصص في النص.');
      return;
    }
    const { matched, unmatched } = resolveBatchGroups(parsed.groups, colleges, collegeId);
    if (matched.length === 0) {
      setError('لم تُطابِق أي كلية في النص كلياتِ هذا الحفل.');
      return;
    }
    setBusy(true);
    setError('');
    setBatchResult(null);
    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (const group of matched) {
      for (const name of group.majors) {
        try {
          await createMajor(group.collegeId, { name });
          added += 1;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) skipped += 1;
          else failed += 1;
        }
      }
    }
    setBusy(false);
    setBatchResult({ added, skipped, failed, unmatched, problems: parsed.problems });
    if (added > 0) setReloadKey((key) => key + 1);
  };

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditingName(m.name);
    setConfirmId(null);
  };

  const handleUpdate = async (m) => {
    const name = editingName.trim();
    if (name.length < 2) {
      setError('اسم التخصص يجب أن يكون حرفين على الأقل.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await updateMajor(m.id, { name });
      setMajors((prev) => prev.map((it) => (it.id === m.id ? { ...it, name: updated?.name || name } : it)));
      setEditingId(null);
      setEditingName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحديث التخصص.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    setBusy(true);
    setError('');
    try {
      await deleteMajor(id);
      setMajors((prev) => prev.filter((m) => m.id !== id));
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حذف التخصص.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="maj-card">
      <div className="maj-head">
        <div>
          <h4 className="maj-title">تخصصات الكليات</h4>
          <p className="maj-sub">أضف أو عدّل أو احذف التخصصات المتاحة لكل كلية في هذا الحفل.</p>
        </div>
        {colleges.length > 1 && (
          <select
            className="maj-select"
            aria-label="اختيار الكلية"
            value={collegeId}
            onChange={(e) => setCollegeId(e.target.value)}
          >
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {colleges.length === 0 ? (
        <p className="maj-empty">لا توجد كليات مرتبطة بهذا الحفل.</p>
      ) : (
        <>
          <div className="maj-batch-toggle">
            <button
              type="button"
              className="maj-btn ghost"
              onClick={() => {
                setBatchMode((v) => !v);
                setBatchResult(null);
                setError('');
              }}
            >
              {batchMode ? 'إغلاق الإضافة الجماعية' : 'إضافة تخصصات جماعياً'}
            </button>
          </div>

          {batchMode && (
            <div className="maj-batch">
              <p className="maj-sub">ألصق نصاً: «كلية: تخصص١، تخصص٢؛ تخصص٣» مع استمرار السطور دون كلية إلى الكلية السابقة.</p>
              <textarea
                className="maj-textarea"
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                rows={6}
                aria-label="نص الإضافة الجماعية"
                placeholder={'كلية الهندسة المعلوماتية: هندسة البرمجيات، الذكاء الاصطناعي\nالشبكات'}
              />
              <div className="maj-batch-actions">
                <button type="button" className="maj-btn primary" disabled={busy} onClick={handleBulkAdd}>
                  بدء الإضافة
                </button>
                <button
                  type="button"
                  className="maj-btn ghost"
                  disabled={busy}
                  onClick={() => {
                    setBatchText('');
                    setBatchResult(null);
                  }}
                >
                  تفريغ
                </button>
              </div>
              {batchResult && (
                <div className="maj-batch-result" role="status">
                  <p>أُضيف: {batchResult.added} | موجود مسبقاً: {batchResult.skipped} | فشل: {batchResult.failed}</p>
                  {batchResult.unmatched.length > 0 && (
                    <p>كليات غير مطابقة: {batchResult.unmatched.join('، ')}</p>
                  )}
                  {batchResult.problems.length > 0 && (
                    <ul>
                      {batchResult.problems.map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <form className="maj-add" onSubmit={handleAdd}>
            <input
              className="maj-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم تخصص جديد"
              aria-label="اسم تخصص جديد"
            />
            <button className="maj-btn primary" type="submit" disabled={busy}>
              إضافة
            </button>
          </form>
            <input
              className="maj-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم تخصص جديد"
              aria-label="اسم تخصص جديد"
            />
            <button className="maj-btn primary" type="submit" disabled={busy}>
              إضافة
            </button>
          </form>

          {error && <p className="maj-error" role="alert">{error}</p>}

          {loading ? (
            <p className="maj-empty">جارٍ تحميل التخصصات...</p>
          ) : (
            <ul className="maj-list">
              {majors.length === 0 && (
                <li className="maj-empty">لا توجد تخصصات لهذه الكلية بعد.</li>
              )}
              {majors.map((m) => (
                <li key={m.id} className="maj-item">
                  {editingId === m.id ? (
                    <>
                      <input
                        className="maj-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        aria-label="تعديل اسم التخصص"
                      />
                      <div className="maj-item-actions">
                        <button type="button" className="maj-btn primary" disabled={busy} onClick={() => handleUpdate(m)}>
                          حفظ
                        </button>
                        <button type="button" className="maj-btn ghost" disabled={busy} onClick={() => { setEditingId(null); setEditingName(''); }}>
                          إلغاء
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="maj-name">{m.name}</span>
                      <div className="maj-item-actions">
                        {confirmId === m.id ? (
                          <>
                            <span className="maj-confirm-text">تأكيد الحذف؟</span>
                            <button type="button" className="maj-btn danger" disabled={busy} onClick={() => handleDelete(m.id)}>
                              نعم
                            </button>
                            <button type="button" className="maj-btn ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                              لا
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="maj-btn ghost" onClick={() => startEdit(m)}>
                              تعديل
                            </button>
                            <button type="button" className="maj-btn danger" disabled={busy} onClick={() => setConfirmId(m.id)}>
                              حذف
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
