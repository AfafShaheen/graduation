import React, { useEffect, useRef, useState } from 'react';
import { ROSTER_COLUMNS } from '../../../utils/rosterView.js';

// "تخصيص الأعمدة": the admin ticks the columns of the table (kept in this browser).
export default function ColumnChooser({ columns, onToggle, onDefault }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div className="rost-cols" ref={box}>
      <button type="button" className="rost-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="exc-symbol" style={{ fontSize: '18px' }}>table_chart</span>
        <span>تخصيص الأعمدة</span>
      </button>
      {open && (
        <div className="rost-cols-menu" role="group" aria-label="الأعمدة الظاهرة">
          {ROSTER_COLUMNS.map((c) => (
            <label key={c.key} className="rost-cols-item">
              <input
                type="checkbox"
                checked={columns.includes(c.key)}
                disabled={c.fixed}
                onChange={() => onToggle(c.key)}
              />
              <span>{c.label}</span>
            </label>
          ))}
          <button type="button" className="rost-cols-reset" onClick={onDefault}>
            الأعمدة الافتراضية
          </button>
        </div>
      )}
    </div>
  );
}
