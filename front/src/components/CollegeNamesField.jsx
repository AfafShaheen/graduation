import { useState } from 'react';
import { FACULTY_OPTIONS } from '../pages/admin/facultyOptions.js';

/*
 * حقل اختيار كليات الحفل.
 * - قابل للتعديل: رقائق للخيارات المعروفة + إضافة أسماء كليات حرّة (D10).
 * - للقراءة فقط (readOnlyNames): يعرض كليات الحفل كما هي دون تعديل.
 */
export default function CollegeNamesField({
  selectedKeys = {},
  customNames = [],
  readOnlyNames = null,
  onToggle,
  onAddCustom,
  onRemoveCustom,
  error,
}) {
  const [draft, setDraft] = useState('');
  const isReadOnly = Array.isArray(readOnlyNames);

  const addCustom = () => {
    const value = draft.trim();
    if (!value) return;
    onAddCustom?.(value);
    setDraft('');
  };

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

  return (
    <div>
      <div className="add-cer-chips-grid">
        {FACULTY_OPTIONS.map((item) => (
          <label key={item.key} className="add-cer-chip">
            <input
              type="checkbox"
              checked={Boolean(selectedKeys[item.key])}
              onChange={() => onToggle?.(item.key)}
            />
            <div className="add-cer-chip-box">
              <span className="add-cer-symbol">
                {selectedKeys[item.key] ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>{item.label}</span>
            </div>
          </label>
        ))}
        {customNames.map((name) => (
          <span key={name} className="add-cer-chip">
            <div className="add-cer-chip-box">
              <span className="add-cer-symbol">account_balance</span>
              <span>{name}</span>
              <button
                type="button"
                onClick={() => onRemoveCustom?.(name)}
                aria-label={`إزالة ${name}`}
                style={{
                  marginInlineStart: 6,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                <span className="add-cer-symbol" style={{ fontSize: 16 }}>
                  close
                </span>
              </button>
            </div>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          type="text"
          className="add-cer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="أضف كلية أخرى غير مذكورة أعلاه"
        />
        <button type="button" className="add-cer-extend-btn" onClick={addCustom}>
          إضافة
        </button>
      </div>

      {error && (
        <p className="add-cer-file-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
