import React, { useState } from 'react';
import Pagination from './Pagination.jsx';
import { useAdminAudit } from '../hooks/useAdminAudit.js';
import { DEFAULT_PAGE_SIZE, clampPage, pageCount } from '../../../utils/roster.js';

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

export default function AuditTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { data, loading, error } = useAdminAudit({
    exceptionalOnly: true,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const logs = data?.items || [];
  const total = data?.total || 0;

  return (
    <section className="exc-card flush">
      <div className="exc-log-head">
        <div>
          <div className="exc-log-title">
            <span className="exc-symbol" style={{ color: '#124d44', fontSize: '24px' }}>history_toggle_off</span>
            <h4 className="exc-card-title">سجل الإجراءات الاستثنائية</h4>
          </div>
          <p className="exc-card-sub">كل إجراء استثنائي نفّذه المشرفون، مع اسم المنفِّذ والوقت.</p>
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
            {!loading && !error && logs.length === 0 && (
              <Row icon="inbox" text="لا توجد إجراءات استثنائية مسجلة بعد" />
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
  );
}
