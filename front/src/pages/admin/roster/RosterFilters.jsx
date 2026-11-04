import React, { useState } from 'react';
import { EXTRA_FILTERS, QUICK_STATUSES, activeQuick, applyQuick, activeExtras } from '../../../utils/rosterView.js';

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="rost-field">
      <span>{label}</span>
      <select className="rost-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">الكل</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/*
 * Search, the ceremony and the college are always in sight. The status chips are shortcuts to the
 * "registration" and "ticket" filters. The rest of the filters wait under "فلاتر إضافية".
 */
export default function RosterFilters({
  filters,
  searchText,
  onSearchText,
  onChange,
  onReset,
  onExport,
  exporting,
  canReset,
  colleges,
  events = [],
}) {
  const [showExtra, setShowExtra] = useState(false);
  const set = (key) => (value) => onChange({ ...filters, [key]: value });
  const collegeOptions = colleges.map((c) => ({ value: String(c.id), label: c.name }));
  const eventOptions = events.map((e) => ({ value: String(e.id), label: e.name }));
  const quick = activeQuick(filters);
  const extras = activeExtras(filters);

  return (
    <section className="exc-card rost-filters" aria-label="البحث والفلاتر">
      <div className="rost-filters-head">
        <div>
          <h4 className="exc-card-title">البحث والفلاتر</h4>
          <p className="exc-card-sub">كل الفلاتر تعمل معاً، والنتائج تتحدّث مباشرة.</p>
        </div>
        <div className="rost-filters-buttons">
          <button type="button" className="rost-btn" onClick={onReset} disabled={!canReset}>
            <span className="exc-symbol" style={{ fontSize: '18px' }}>filter_alt_off</span>
            <span>مسح الكل</span>
          </button>
          <button type="button" className="rost-btn solid" onClick={onExport} disabled={exporting}>
            <span className="exc-symbol" style={{ fontSize: '18px' }}>download</span>
            <span>{exporting ? 'جارٍ التصدير...' : 'تصدير Excel'}</span>
          </button>
        </div>
      </div>

      <div className="rost-main-row">
        <label className="rost-field rost-field-search">
          <span>بحث بالاسم أو الرقم الجامعي</span>
          <input
            type="text"
            autoComplete="off"
            className="rost-input"
            placeholder="مثال: أحمد أو 100234"
            value={searchText}
            onChange={(e) => onSearchText(e.target.value)}
          />
        </label>
        <SelectField label="الحفل" value={filters.eventId} options={eventOptions} onChange={set('eventId')} />
        <SelectField label="الكلية" value={filters.collegeId} options={collegeOptions} onChange={set('collegeId')} />
      </div>

      <div className="rost-chips" role="group" aria-label="حالة الخريج">
        {QUICK_STATUSES.map((q) => (
          <button
            key={q.key}
            type="button"
            className={`rost-chip ${quick === q.key ? 'on' : ''} ${q.warn ? 'warn' : ''}`.trim()}
            aria-pressed={quick === q.key}
            onClick={() => onChange(applyQuick(filters, q.key))}
          >
            {q.label}
          </button>
        ))}
        <button
          type="button"
          className="rost-more"
          aria-expanded={showExtra}
          onClick={() => setShowExtra((v) => !v)}
        >
          <span className="exc-symbol" style={{ fontSize: '18px' }}>filter_alt</span>
          <span>فلاتر إضافية{extras.length ? ` (${extras.length})` : ''}</span>
        </button>
      </div>

      {showExtra && (
        <div className="rost-filter-grid">
          {EXTRA_FILTERS.map((f) => (
            <SelectField key={f.key} label={f.label} value={filters[f.key]} options={f.options} onChange={set(f.key)} />
          ))}
        </div>
      )}

      {extras.length > 0 && (
        <div className="rost-tags" aria-label="الفلاتر المفعّلة">
          {extras.map((tag) => (
            <span key={tag.key} className="rost-tag">
              {tag.label}
              <button type="button" aria-label={`إزالة ${tag.label}`} onClick={() => set(tag.key)('')}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
