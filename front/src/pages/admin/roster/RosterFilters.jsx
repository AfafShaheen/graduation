import React from 'react';
import {
  REGISTRATION_OPTIONS,
  TOP_OPTIONS,
  TICKET_OPTIONS,
  PAYMENT_OPTIONS,
  ENTRY_OPTIONS,
  TICKET_TYPE_OPTIONS,
} from '../../../utils/roster.js';

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

export default function RosterFilters({
  filters,
  searchText,
  onSearchText,
  onChange,
  onReset,
  onExport,
  exporting,
  canReset,
  files,
  colleges,
}) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value });
  const fileOptions = files.map((f) => ({ value: String(f.id), label: f.original_name }));
  const collegeOptions = colleges.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <section className="exc-card rost-filters" aria-label="البحث والفلاتر">
      <div className="rost-filters-head">
        <div>
          <h4 className="exc-card-title">البحث والفلاتر</h4>
          <p className="exc-card-sub">كل الفلاتر بتشتغل مع بعضها، والنتائج بتتحدّث مباشرة.</p>
        </div>
        <div className="rost-filters-buttons">
          <button type="button" className="rost-btn" onClick={onReset} disabled={!canReset}>
            <span className="exc-symbol" style={{ fontSize: '18px' }}>filter_alt_off</span>
            <span>إعادة الضبط</span>
          </button>
          <button
            type="button"
            className="rost-btn solid"
            onClick={onExport}
            disabled={exporting}
          >
            <span className="exc-symbol" style={{ fontSize: '18px' }}>download</span>
            <span>{exporting ? 'جارٍ التصدير...' : 'تصدير Excel'}</span>
          </button>
        </div>
      </div>

      <div className="rost-filter-grid">
        <label className="rost-field rost-field-wide">
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

        <SelectField label="الملف المرفوع" value={filters.fileId} options={fileOptions} onChange={set('fileId')} />
        <SelectField label="الكلية" value={filters.collegeId} options={collegeOptions} onChange={set('collegeId')} />
        <SelectField label="التسجيل" value={filters.registration} options={REGISTRATION_OPTIONS} onChange={set('registration')} />
        <SelectField label="الأوائل" value={filters.topRank} options={TOP_OPTIONS} onChange={set('topRank')} />
        <SelectField label="التذكرة" value={filters.ticket} options={TICKET_OPTIONS} onChange={set('ticket')} />
        <SelectField label="الدفع" value={filters.payment} options={PAYMENT_OPTIONS} onChange={set('payment')} />
        <SelectField label="الدخول" value={filters.entry} options={ENTRY_OPTIONS} onChange={set('entry')} />
        <SelectField label="نوع التذكرة" value={filters.ticketType} options={TICKET_TYPE_OPTIONS} onChange={set('ticketType')} />
      </div>
    </section>
  );
}
