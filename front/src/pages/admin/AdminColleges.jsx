import React, { useCallback, useEffect, useState } from 'react';
import '../../style/AdminDashboard.css';
import '../../style/AdminColleges.css';
import AdminSidebar from '../../components/AdminSidebar';
import MajorsManager from './MajorsManager';
import {
  listColleges,
  createCollege,
  updateCollege,
  deleteCollege,
  ApiError,
} from '../../api/admin.js';

const MIN_NAME = 2;
const MAX_NAME = 255;

export default function AdminColleges({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onAddTicket,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [colleges, setColleges] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError('');
    listColleges()
      .then((res) => {
        if (cancel) return;
        const items = Array.isArray(res) ? res : res?.items || [];
        setColleges(items);
        setSelectedId((prev) =>
          items.some((c) => String(c.id) === String(prev))
            ? prev
            : items[0]?.id
              ? String(items[0].id)
              : ''
        );
      })
      .catch((e) => {
        if (cancel) return;
        setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الكليات.');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const validateName = useCallback((value) => {
    const name = value.trim();
    if (name.length < MIN_NAME) return 'اسم الكلية يجب أن يكون حرفين على الأقل.';
    if (name.length > MAX_NAME) return 'اسم الكلية طويل جداً.';
    return '';
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    const invalid = validateName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await createCollege({ name });
      setColleges((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      );
      setSelectedId(String(created.id));
      setNewName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إضافة الكلية.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (college) => {
    setEditingId(college.id);
    setEditingName(college.name);
    setConfirmId(null);
  };

  const handleUpdate = async (college) => {
    const name = editingName.trim();
    const invalid = validateName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await updateCollege(college.id, { name });
      setColleges((prev) =>
        prev
          .map((c) => (c.id === college.id ? { ...c, name: updated?.name || name } : c))
          .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      );
      setEditingId(null);
      setEditingName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحديث الكلية.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    setBusy(true);
    setError('');
    try {
      await deleteCollege(id);
      setColleges((prev) => {
        const next = prev.filter((c) => c.id !== id);
        setSelectedId((cur) =>
          String(cur) === String(id) ? (next[0] ? String(next[0].id) : '') : cur
        );
        return next;
      });
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حذف الكلية.');
    } finally {
      setBusy(false);
    }
  };

  const selected = colleges.find((c) => String(c.id) === String(selectedId)) || null;

  return (
    <div className="adm-app-container">
      <div className="adm-top-accent"></div>

      <AdminSidebar
        activeId="colleges"
        currentId="colleges"
        showAddButton={false}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onAddTicket={onAddTicket}
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
          <h2>الكليات والاختصاصات</h2>
          <span>جامعة حمص</span>
        </div>

        <button
          type="button"
          className="col-back-btn"
          onClick={() => onNavigate && onNavigate('dashboard')}
        >
          <span className="adm-symbol" style={{ fontSize: '18px' }}>arrow_forward</span>
          <span className="col-back-text">العودة إلى لوحة الإحصائيات</span>
        </button>
      </header>

      <main className="adm-main-canvas">
        <section className="col-hero">
          <h3 className="col-hero-title">كتالوج الكليات</h3>
          <p className="col-hero-sub">
            كتالوج مركزي للكليات قابلة لإعادة الاستخدام بين الحفلات. أضف الكليات وتخصصاتها هنا، ثم اختَرها عند إنشاء الحفل.
          </p>
        </section>

        {error && (
          <p className="col-error" role="alert">{error}</p>
        )}

        <div className="col-grid">
          <section className="col-card">
            <h4 className="col-title">الكليات</h4>

            <form className="col-add" onSubmit={handleAdd}>
              <input
                className="col-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم كلية جديدة"
                aria-label="اسم كلية جديدة"
              />
              <button className="col-btn primary" type="submit" disabled={busy}>
                إضافة
              </button>
            </form>

            {loading ? (
              <p className="col-empty">جارٍ تحميل الكليات...</p>
            ) : colleges.length === 0 ? (
              <p className="col-empty">لا توجد كليات بعد. أضف أول كلية من الأعلى.</p>
            ) : (
              <ul className="col-list">
                {colleges.map((c) => (
                  <li
                    key={c.id}
                    className={`col-item ${String(c.id) === String(selectedId) ? 'active' : ''}`}
                  >
                    {editingId === c.id ? (
                      <>
                        <input
                          className="col-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          aria-label="تعديل اسم الكلية"
                        />
                        <div className="col-item-actions">
                          <button
                            type="button"
                            className="col-btn primary"
                            disabled={busy}
                            onClick={() => handleUpdate(c)}
                          >
                            حفظ
                          </button>
                          <button
                            type="button"
                            className="col-btn ghost"
                            disabled={busy}
                            onClick={() => { setEditingId(null); setEditingName(''); }}
                          >
                            إلغاء
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="col-name-btn"
                          onClick={() => setSelectedId(String(c.id))}
                          aria-current={String(c.id) === String(selectedId) ? 'true' : undefined}
                        >
                          <span className="adm-symbol">account_balance</span>
                          <span className="col-name">{c.name}</span>
                          <span className="col-count">{(c.majors || []).length} تخصص</span>
                        </button>
                        <div className="col-item-actions">
                          {confirmId === c.id ? (
                            <>
                              <span className="col-confirm-text">تأكيد الحذف؟</span>
                              <button
                                type="button"
                                className="col-btn danger"
                                disabled={busy}
                                onClick={() => handleDelete(c.id)}
                              >
                                نعم
                              </button>
                              <button
                                type="button"
                                className="col-btn ghost"
                                disabled={busy}
                                onClick={() => setConfirmId(null)}
                              >
                                لا
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="col-btn ghost" onClick={() => startEdit(c)}>
                                تعديل
                              </button>
                              <button
                                type="button"
                                className="col-btn danger"
                                disabled={busy}
                                onClick={() => setConfirmId(c.id)}
                              >
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
          </section>

          <section className="col-card">
            {selected ? (
              <MajorsManager colleges={[selected]} key={selected.id} />
            ) : (
              <p className="col-empty">اختَر كلية لعرض وإدارة تخصصاتها.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
