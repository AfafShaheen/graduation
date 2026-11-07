import React, { useEffect, useMemo, useState } from 'react';
import Pagination from './Pagination.jsx';
import { useAdminAudit, useAuditActionMenu } from '../hooks/useAdminAudit.js';
import { DEFAULT_PAGE_SIZE, clampPage, pageCount } from '../../../utils/roster.js';
import {
  ACTOR_OPTIONS,
  EMPTY_AUDIT_FILTERS,
  auditQuery,
  dateRangeError,
  hasActiveAuditFilters,
} from '../../../utils/auditFilters.js';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Damascus',
  }).format(d);
};

const initialsOf = (name) => {
  if (!name) return '؟';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('.');
};

function Row({ icon, text, role }) {
  return (
    <tr>
      <td colSpan={4}>
        <div className="exc-empty" role={role}>
          <span className="exc-symbol">{icon}</span>
          <span>{text}</span>
        </div>
      </td>
    </tr>
  );
}

/*
 * The audit log: every action of the admins, the scanners and the graduates, newest first.
 * The filters: one search box (graduate, university id, who acted, a word of the details), the
 * kind of action (grouped, or only the exceptional ones), who acted, a period, and the scan
 * attempts (hidden unless asked: they are by far the most frequent rows).
 */
export default function AuditTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState(EMPTY_AUDIT_FILTERS);
  const [searchText, setSearchText] = useState('');
  const menu = useAuditActionMenu();

  // the search waits until he stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.q === searchText ? prev : { ...prev, q: searchText }));
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const rangeError = dateRangeError(filters);
  const query = useMemo(
    () => auditQuery(filters, menu, { limit: pageSize, offset: (page - 1) * pageSize }),
    [filters, menu, pageSize, page],
  );
  const { data, loading, error } = useAdminAudit(query, { enabled: !rangeError && menu !== null });
  const logs = data?.items || [];
  const total = data?.total || 0;

  const change = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };
  const reset = () => {
    setFilters(EMPTY_AUDIT_FILTERS);
    setSearchText('');
    setPage(1);
  };

  return (
    <>
      <section className="exc-card rost-filters" aria-label="فلاتر سجل الإجراءات">
        <div className="rost-filters-head">
          <div>
            <h4 className="exc-card-title">فلاتر السجل</h4>
            <p className="exc-card-sub">كل الفلاتر تعمل معاً، والنتائج تتحدّث مباشرة.</p>
          </div>
          <div className="rost-filters-buttons">
            <button
              type="button"
              className="rost-btn"
              onClick={reset}
              disabled={!hasActiveAuditFilters(filters) && !searchText}
            >
              <span className="exc-symbol" style={{ fontSize: '18px' }}>filter_alt_off</span>
              <span>مسح الكل</span>
            </button>
          </div>
        </div>

        <div className="rost-filter-grid">
          <label className="rost-field">
            <span>بحث</span>
            <input
              type="search"
              className="rost-input"
              placeholder="اسم الخريج أو رقمه الجامعي أو المنفِّذ أو كلمة من التفاصيل"
              value={searchText}
              maxLength={100}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </label>

          <label className="rost-field">
            <span>نوع الإجراء</span>
            <select
              className="rost-select"
              value={filters.choice}
              onChange={(e) => change({ choice: e.target.value })}
            >
              <option value="all">كل الإجراءات</option>
              <option value="exceptional">الاستثنائية فقط</option>
              {(menu?.groups || []).map((group) => (
                <optgroup key={group.key} label={group.label}>
                  <option value={`group:${group.key}`}>كل «{group.label}»</option>
                  {group.actions.map((action) => (
                    <option key={action.code} value={`action:${action.code}`}>
                      {action.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="rost-field">
            <span>المنفِّذ</span>
            <select
              className="rost-select"
              value={filters.actorType}
              onChange={(e) => change({ actorType: e.target.value })}
            >
              <option value="">الكل</option>
              {ACTOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="rost-field">
            <span>من تاريخ</span>
            <input
              type="date"
              className="rost-input"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => change({ from: e.target.value })}
            />
          </label>

          <label className="rost-field">
            <span>إلى تاريخ</span>
            <input
              type="date"
              className="rost-input"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => change({ to: e.target.value })}
            />
          </label>

          <label className="rost-field rost-check">
            <span>محاولات المسح</span>
            <span className="rost-check-row">
              <input
                type="checkbox"
                checked={filters.scans}
                onChange={(e) => change({ scans: e.target.checked })}
              />
              <span>إظهار كل محاولات المسح (كثيرة يوم الحفل)</span>
            </span>
          </label>
        </div>

        {rangeError && (
          <p className="exc-alert" role="alert" style={{ marginTop: 12 }}>
            {rangeError}
          </p>
        )}
      </section>

      <section className="exc-card flush">
        <div className="exc-log-head">
          <div>
            <div className="exc-log-title">
              <span className="exc-symbol" style={{ color: 'var(--brand-green)', fontSize: '24px' }}>history_toggle_off</span>
              <h4 className="exc-card-title">سجل الإجراءات</h4>
            </div>
            <p className="exc-card-sub">
              كل ما نفّذه المشرفون والماسحات والخريجون، مع اسم المنفِّذ والوقت.
              {total > 0 ? ` (${total} إجراء)` : ''}
            </p>
          </div>
        </div>

        <div className="rost-table-wrap">
          <table className="rost-table">
            <thead>
              <tr>
                <th>المنفِّذ</th>
                <th>الإجراء المتخذ</th>
                <th>المستفيد / التذكرة</th>
                <th>الوقت والتاريخ</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 && <Row icon="hourglass_top" text="جارٍ تحميل السجل..." />}
              {!loading && error && <Row icon="error" text={error} role="alert" />}
              {!loading && !error && !rangeError && logs.length === 0 && (
                <Row
                  icon="inbox"
                  text={hasActiveAuditFilters(filters) ? 'لا توجد نتائج مطابقة للفلاتر الحالية.' : 'لا توجد إجراءات مسجلة بعد'}
                />
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div className="exc-exec-cell">
                      <div className="exc-exec-avatar">{initialsOf(log.actor?.username)}</div>
                      <div>
                        <div className="exc-cell-main">{log.actor?.username || '—'}</div>
                        <div className="exc-cell-sub">{log.actor?.role_label || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="exc-cell-main">{log.action_label || log.action}</div>
                    <div className="exc-cell-sub">{log.details || '—'}</div>
                  </td>
                  <td>
                    <div className="exc-cell-main">{log.graduate?.full_name || '—'}</div>
                    <div className="exc-cell-sub num">
                      {log.ticket_id != null ? `#${log.ticket_id}` : log.graduate?.university_id || '—'}
                    </div>
                  </td>
                  <td>
                    <span className="exc-cell-sub">{formatDateTime(log.created_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <Pagination
            page={page}
            pageCount={pageCount(total, pageSize)}
            pageSize={pageSize}
            total={total}
            shown={logs.length}
            disabled={loading}
            onPage={(n) => setPage(clampPage(n, total, pageSize))}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            noun="إجراء"
          />
        )}
      </section>
    </>
  );
}
