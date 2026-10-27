import React from 'react';
import {
  badgeTone,
  registrationLabel,
  ticketStatusLabel,
  paymentLabel,
  topLabel,
  entryLabel,
} from '../../../utils/roster.js';
import { companionsLabel } from '../../../utils/companions';

function Badge({ tone, children }) {
  return <span className={`rost-badge rost-tone-${tone}`}>{children}</span>;
}

function Message({ icon, text, role }) {
  return (
    <tr>
      <td colSpan={8}>
        <div className="exc-empty" role={role}>
          <span className="exc-symbol">{icon}</span>
          <span>{text}</span>
        </div>
      </td>
    </tr>
  );
}

export default function RosterTable({ items, loading, error, selectedId, onSelect }) {
  return (
    <div className="rost-table-wrap">
      <table className="rost-table">
        <thead>
          <tr>
            <th>الخريج</th>
            <th>الكلية والتخصص</th>
            <th>الأوائل</th>
            <th>التسجيل</th>
            <th>التذكرة</th>
            <th>الدفع</th>
            <th>الدخول</th>
            <th>الملف</th>
          </tr>
        </thead>
        <tbody>
          {loading && items.length === 0 && (
            <Message icon="hourglass_top" text="جارٍ تحميل القائمة..." />
          )}
          {!loading && error && <Message icon="error" text={error} role="alert" />}
          {!loading && !error && items.length === 0 && (
            <Message icon="inbox" text="ما في نتائج مطابقة للفلاتر الحالية." />
          )}

          {items.map((item) => {
            const ticket = item.ticket;
            return (
              <tr
                key={item.record_id}
                className={item.record_id === selectedId ? 'selected' : ''}
                onClick={() => onSelect(item.record_id)}
              >
                <td>
                  <button
                    type="button"
                    className="rost-name-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(item.record_id);
                    }}
                  >
                    {item.full_name}
                  </button>
                  <div className="exc-cell-sub num">{item.university_id}</div>
                </td>

                <td>
                  <div className="exc-cell-main">{item.college_name}</div>
                  <div className="exc-cell-sub">{item.major_name || '—'}</div>
                </td>

                <td>
                  {item.is_top ? <Badge tone="ok">{topLabel(item)}</Badge> : <span className="rost-dash">—</span>}
                </td>

                <td>
                  <Badge tone={badgeTone('registration', item.registration.state)}>
                    {registrationLabel(item.registration.state)}
                  </Badge>
                </td>

                <td>
                  {ticket ? (
                    <>
                      <Badge tone={badgeTone('ticket', ticket.status)}>
                        {ticketStatusLabel(ticket.status)}
                      </Badge>
                      <div className="exc-cell-sub">
                        {companionsLabel(ticket.companions_count)}
                        {ticket.seat ? ` — ${ticket.seat}` : ''}
                      </div>
                    </>
                  ) : (
                    <span className="rost-dash">لا توجد تذكرة</span>
                  )}
                </td>

                <td>
                  <Badge tone={badgeTone('payment', item.payment.state)}>
                    {paymentLabel(item.payment.state)}
                  </Badge>
                  {item.payment.amount && (
                    <div className="exc-cell-sub num">{item.payment.amount}</div>
                  )}
                  {item.payment.mismatch && <Badge tone="bad">المبلغ غير مطابق</Badge>}
                </td>

                <td>
                  <Badge tone={badgeTone('entry', item.entry.entered ? 'entered' : 'not_entered')}>
                    {entryLabel(item.entry)}
                  </Badge>
                </td>

                <td>
                  <span className="exc-cell-sub">{item.file_name || '—'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
