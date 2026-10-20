import React, { useCallback, useEffect, useState } from 'react';
import '../../style/AdminDashboard.css';
import '../../style/AdminVerifyDiagnostic.css';
import AdminSidebar from '../../components/AdminSidebar';
import {
  listColleges,
  getMajors,
  diagnoseUniversityRecord,
  ApiError,
} from '../../api/admin.js';

const GENDER_LABELS = { male: 'ذكر', female: 'أنثى' };

/*
  P7.2 — أداة تشخيص المطابقة: يتيح لأمين الاتحاد إدخال بيانات خريج عالق
  (الرقم الجامعي + الكلية + الاسم العائلي/الأب/الأم/الجنس) فيعرض السجل المخزّن
  في قاعدة البيانات، والحقول التي لا تتطابق، وهل سجّل مسبقاً.
*/
export default function AdminVerifyDiagnostic({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  onNavigate,
  onAddTicket,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [colleges, setColleges] = useState([]);
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    university_id: '',
    college_id: '',
    first_name: '',
    last_name: '',
    father_name: '',
    mother_name: '',
    gender: '',
    major_id: '',
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancel = false;
    listColleges()
      .then((res) => {
        if (cancel) return;
        const items = Array.isArray(res) ? res : res?.items || [];
        setColleges(items);
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

  useEffect(() => {
    let cancel = false;
    const id = Number(form.college_id);
    if (!id) {
      setMajors([]);
      return undefined;
    }
    getMajors(id)
      .then((res) => {
        if (cancel) return;
        setMajors(Array.isArray(res) ? res : res?.items || []);
      })
      .catch(() => {
        if (!cancel) setMajors([]);
      });
    return () => {
      cancel = true;
    };
  }, [form.college_id]);

  const setField = (name) => (e) => {
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
  };

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError('');
      setResult(null);

      if (!form.university_id.trim()) {
        setError('أدخل الرقم الجامعي.');
        return;
      }
      if (!form.college_id) {
        setError('اختر الكلية.');
        return;
      }

      setBusy(true);
      try {
        const payload = {
          university_id: form.university_id.trim(),
          college_id: Number(form.college_id),
        };
        if (form.first_name.trim()) payload.first_name = form.first_name.trim();
        if (form.last_name.trim()) payload.last_name = form.last_name.trim();
        if (form.father_name.trim()) payload.father_name = form.father_name.trim();
        if (form.mother_name.trim()) payload.mother_name = form.mother_name.trim();
        if (form.gender) payload.gender = form.gender;
        if (form.major_id) payload.major_id = Number(form.major_id);

        const res = await diagnoseUniversityRecord(payload);
        setResult(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'تعذّر تنفيذ التشخيص.');
      } finally {
        setBusy(false);
      }
    },
    [form]
  );

  const handleReset = () => {
    setResult(null);
    setError('');
    setForm({
      university_id: '',
      college_id: '',
      first_name: '',
      last_name: '',
      father_name: '',
      mother_name: '',
      gender: '',
      major_id: '',
    });
  };

  return (
    <div className="adm-app-container">
      <div className="adm-top-accent"></div>
      <AdminSidebar
        activeId="verify"
        currentId="verify"
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
        <button className="adm-menu-btn" onClick={() => setNavOpen(true)}>
          <span className="adm-symbol" style={{ fontSize: '24px' }}>
            menu
          </span>
        </button>
        <div className="adm-topbar-title">
          <h2>تشخيص المطابقة</h2>
          <span>جامعة حمص</span>
        </div>
        <button className="vd-back-btn" onClick={() => onNavigate && onNavigate('dashboard')}>
          <span className="adm-symbol" style={{ fontSize: '18px' }}>
            arrow_forward
          </span>
          <span className="vd-back-text">العودة إلى لوحة الإحصائيات</span>
        </button>
      </header>

      <main className="adm-main-canvas">
        <section className="vd-hero">
          <h1 className="vd-hero-title">تشخيص مطابقة بيانات الخريج</h1>
          <p className="vd-hero-sub">
            أدخل بيانات الخريج العالق لعرض السجل المخزّن لدينا وتحديد الحقل غير المتطابق.
            هذه الأداة للإدارة فقط ولا تُغيّر أي بيانات.
          </p>
        </section>

        {error && (
          <div className="vd-error" role="alert">
            <span className="adm-symbol" style={{ fontSize: '18px' }}>
              error
            </span>
            <span>{error}</span>
          </div>
        )}

        <form className="vd-card" onSubmit={handleSubmit}>
          <h3 className="vd-title">بيانات الخريج</h3>

          <div className="vd-grid">
            <label className="vd-field">
              <span className="vd-field-label">الرقم الجامعي</span>
              <input
                className="vd-input"
                value={form.university_id}
                onChange={setField('university_id')}
                placeholder="مثال: 123456"
              />
            </label>

            <label className="vd-field">
              <span className="vd-field-label">الكلية</span>
              <select
                className="vd-select"
                value={form.college_id}
                onChange={setField('college_id')}
                disabled={loading}
              >
                <option value="">اختر الكلية…</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="vd-field">
              <span className="vd-field-label">الاسم</span>
              <input
                className="vd-input"
                value={form.first_name}
                onChange={setField('first_name')}
                placeholder="الاسم الأول"
              />
            </label>

            <label className="vd-field">
              <span className="vd-field-label">الكنية</span>
              <input
                className="vd-input"
                value={form.last_name}
                onChange={setField('last_name')}
                placeholder="الكنية"
              />
            </label>

            <label className="vd-field">
              <span className="vd-field-label">اسم الأب</span>
              <input
                className="vd-input"
                value={form.father_name}
                onChange={setField('father_name')}
              />
            </label>

            <label className="vd-field">
              <span className="vd-field-label">اسم الأم</span>
              <input
                className="vd-input"
                value={form.mother_name}
                onChange={setField('mother_name')}
              />
            </label>

            <label className="vd-field">
              <span className="vd-field-label">الجنس</span>
              <select className="vd-select" value={form.gender} onChange={setField('gender')}>
                <option value="">—</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </label>

            <label className="vd-field">
              <span className="vd-field-label">التخصص</span>
              <select
                className="vd-select"
                value={form.major_id}
                onChange={setField('major_id')}
                disabled={!form.college_id}
              >
                <option value="">لا يوجد / غير محدد</option>
                {majors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="vd-actions">
            <button type="submit" className="vd-btn primary" disabled={busy}>
              {busy ? 'جارٍ التشخيص…' : 'تشخيص المطابقة'}
            </button>
            <button type="button" className="vd-btn ghost" onClick={handleReset}>
              تفريغ الحقول
            </button>
          </div>
        </form>

        {result && !result.found && (
          <div className="vd-card">
            <h3 className="vd-title">النتيجة</h3>
            <p className="vd-missing">
              <span className="adm-symbol" style={{ fontSize: '18px' }}>
                search_off
              </span>
              {result.message || 'لا يوجد سجل مطابق.'}
            </p>
          </div>
        )}

        {result && result.found && (
          <div className="vd-card">
            <h3 className="vd-title">النتيجة</h3>

            {result.already_registered && (
              <p className="vd-badge warn">
                هذا الخريج مسجّل مسبقاً في هذه الكلية.
              </p>
            )}

            {result.mismatches && result.mismatches.length > 0 ? (
              <p className="vd-badge danger">
                الحقول غير المتطابقة: {result.mismatches.join('، ')}
              </p>
            ) : (
              <p className="vd-badge ok">جميع الحقول المُدخلة مطابقة للسجل المخزّن.</p>
            )}

            <div className="vd-section">
              <h4 className="vd-section-title">الحقول المقارَنة</h4>
              <div className="vd-fields">
                {result.fields.map((f) => (
                  <div
                    key={f.field}
                    className={`vd-row ${f.matches ? 'ok' : 'bad'}`}
                  >
                    <span className="vd-row-label">{f.label}</span>
                    <span className="vd-row-cell">
                      <em>السجل:</em> {f.expected || '—'}
                    </span>
                    <span className="vd-row-cell">
                      <em>المُدخل:</em> {f.provided || '—'}
                    </span>
                    <span className="vd-row-flag">
                      {f.matches ? '✔' : '✘'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="vd-section">
              <h4 className="vd-section-title">السجل المخزّن</h4>
              <div className="vd-record">
                <div>
                  <span className="vd-k">الاسم الكامل</span>
                  <span className="vd-v">{result.record.full_name || '—'}</span>
                </div>
                <div>
                  <span className="vd-k">اسم الأب</span>
                  <span className="vd-v">{result.record.father_name || '—'}</span>
                </div>
                <div>
                  <span className="vd-k">اسم الأم</span>
                  <span className="vd-v">{result.record.mother_name || '—'}</span>
                </div>
                <div>
                  <span className="vd-k">الجنس</span>
                  <span className="vd-v">
                    {GENDER_LABELS[result.record.gender] || result.record.gender || '—'}
                  </span>
                </div>
                <div>
                  <span className="vd-k">الكلية</span>
                  <span className="vd-v">{result.record.college_name || '—'}</span>
                </div>
                <div>
                  <span className="vd-k">التخصص</span>
                  <span className="vd-v">{result.record.major_name || '—'}</span>
                </div>
                <div>
                  <span className="vd-k">المعدل</span>
                  <span className="vd-v">{result.record.gpa || '—'}</span>
                </div>
                <div>
                  <span className="vd-k">حالة الأوائل (من الملف)</span>
                  <span className="vd-v">
                    {result.record.top_rank_from_file == null
                      ? '—'
                      : result.record.top_rank_from_file}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
