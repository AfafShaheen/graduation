import { useState } from 'react';

/*
 * حقل اختيار كليات الحفل من الكتالوج المركزي (P5.7).
 * - قابل للتعديل: قائمة كليات الكتالوج مع بحث، كل كلية رقاقة قابلة للتحديد.
 * - للقراءة فقط (readOnlyNames): يعرض كليات الحفل كما هي دون تعديل.
 */
export default function CollegeCatalogField({
  colleges = [],
  selectedIds = [],
  onToggle,
  readOnlyNames = null,
  loading = false,
  error,
}) {
  const [query, setQuery] = useState('');
  const isReadOnly = Array.isArray(readOnlyNames);
  const selected = Array.isArray(selectedIds) ? selectedIds : [];

  if (isReadOnly) {
    const names = readOnlyNames.filter(Boolean);
    if (names.length === 0) {
      return <p className="add-cer-hint">لا توجد كليات مرتبطة بهذا الحفل.</p>;
    }
    return (
      <div className="add-cer-chips-grid">
        {names.map((name) => (
          <span key={name} className="add-cer-chip add-cer-chip-disabled">
            <div className="add-cer-chip-box">
              <span className="add-cer-symbol">account_balance</span>
              <span>{name}</span>
            </div>
          </span>
        ))}
      </div>
    );
  }

  const term = query.trim().toLowerCase();
  const visible = term
    ? colleges.filter((c) => String(c.name || '').toLowerCase().includes(term))
    : colleges;

  return (
    <div>
      <input
        type="text"
        className="add-cer-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث عن كلية"
        style={{ marginBottom: 10 }}
      />

      {loading ? (
        <p className="add-cer-hint">جارٍ تحميل الكليات…</p>
      ) : colleges.length === 0 ? (
        <p className="add-cer-hint">
          لا توجد كليات في الكتالوج بعد. أضفها من صفحة «كليات واختصاصات».
        </p>
      ) : visible.length === 0 ? (
        <p className="add-cer-hint">لا توجد نتائج مطابقة للبحث.</p>
      ) : (
        <div className="add-cer-chips-grid">
          {visible.map((college) => {
            const checked = selected.includes(college.id);
            return (
              <label key={college.id} className="add-cer-chip">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle?.(college.id)}
                />
                <div className="add-cer-chip-box">
                  <span className="add-cer-symbol">
                    {checked ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span>{college.name}</span>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {error && (
        <p className="add-cer-file-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
