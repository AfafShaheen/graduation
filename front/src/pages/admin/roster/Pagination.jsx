import React from 'react';
import { PAGE_SIZES, pageWindow, rangeLabel } from '../../../utils/roster.js';

// Page navigation shared by the roster and the audit log.
export default function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  shown,
  disabled = false,
  onPage,
  onPageSize,
  noun = 'نتيجة',
}) {
  return (
    <nav className="rost-pager" aria-label="التنقل بين الصفحات">
      <div className="rost-pager-info" aria-live="polite">
        <span>عرض {rangeLabel(page, pageSize, total, shown)}</span>
        <span className="rost-pager-noun">{noun}</span>
      </div>

      <div className="rost-pager-buttons">
        <button
          type="button"
          className="rost-page-btn"
          onClick={() => onPage(page - 1)}
          disabled={disabled || page <= 1}
        >
          السابق
        </button>

        {pageWindow(page, pageCount).map((entry, index) =>
          entry === '…' ? (
            <span key={`gap-${index}`} className="rost-page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={`rost-page-btn${entry === page ? ' active' : ''}`}
              aria-current={entry === page ? 'page' : undefined}
              onClick={() => onPage(entry)}
              disabled={disabled}
            >
              {entry}
            </button>
          ),
        )}

        <button
          type="button"
          className="rost-page-btn"
          onClick={() => onPage(page + 1)}
          disabled={disabled || page >= pageCount}
        >
          التالي
        </button>
      </div>

      <label className="rost-pager-size">
        <span>عدد الصفوف</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          disabled={disabled}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
