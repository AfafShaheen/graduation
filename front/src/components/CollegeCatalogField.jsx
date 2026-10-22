import { useState } from 'react';

/*
 * حقل اختيار كليات الحفل من الكتالوج المركزي (P5.7).
 * - وضع الإنشاء: قائمة كليات الكتالوج مع بحث، كل كلية رقاقة قابلة للتحديد.
 * - وضع التعديل (onRemove): الكليات المرتبطة قابلة للإزالة، مع زر إضافة كلية.
 */
export default function CollegeCatalogField({
  colleges = [],
  selectedIds = [],
  onToggle,
  onRemove,
  loading = false,
  error,
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  const term = query.trim().toLowerCase();
  const matches = (college) => String(college.name || '').toLowerCase().includes(term);

  if (typeof onRemove === 'function') {
    const selectedColleges = colleges.filter((c) => selected.includes(c.id));
    const available = colleges.filter((c) => !selected.includes(c.id));
    const visible = term ? available.filter(matches) : available;

    return (
      <div>
        <div className="add-cer-chips-grid">
          {selectedColleges.map((college) => (
            <div key={college.id} className="add-cer-chip add-cer-chip-manage">
              <div className="add-cer-chip-box">
                <span className="add-cer-symbol">account_balance</span>
                <span>{college.name}</span>
                <button
                  type="button"
                  className="add-cer-chip-remove"
                  onClick={() => onRemove(college.id)}
                  aria-label={`إزالة ${college.name}`}
                  title={`إزالة ${college.name}`}
                >
                  <span className="add-cer-symbol" style={{ fontSize: '16px' }}>close</span>
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="add-cer-add-college-btn"
            onClick={() => setAdding((open) => !open)}
            disabled={loading}
          >
            <span className="add-cer-symbol" style={{ fontSize: '18px' }}>
              {adding ? 'close' : 'add'}
            </span>
            <span>{adding ? 'إلغاء الإضافة' : 'إضافة كلية'}</span>
          </button>
        </div>

        {loading ? (
          <p className="add-cer-hint">جارٍ تحميل الكليات…</p>
        ) : adding ? (
          <div style={{ marginTop: 12 }}>
            <input
              type="text"
              className="add-cer-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن كلية لإضافتها"
              style={{ marginBottom: 10 }}
            />
            {available.length === 0 ? (
              <p className="add-cer-hint">كل كليات الكتالوج مرتبطة بهذا الحفل.</p>
            ) : visible.length === 0 ? (
              <p className="add-cer-hint">لا توجد نتائج مطابقة للبحث.</p>
            ) : (
              <div className="add-cer-chips-grid">
                {visible.map((college) => (
                  <label key={college.id} className="add-cer-chip">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => onToggle?.(college.id)}
                    />
                    <div className="add-cer-chip-box">
                      <span className="add-cer-symbol">add_circle</span>
                      <span>{college.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : selectedColleges.length === 0 ? (
          <p className="add-cer-hint">لا توجد كليات مرتبطة بهذا الحفل.</p>
        ) : null}

        {error && (
          <p className="add-cer-file-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const visible = term ? colleges.filter(matches) : colleges;

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
