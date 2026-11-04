import React from 'react';
import {
  badgeTone,
  registrationLabel,
  ticketStatusLabel,
  paymentLabel,
  topLabel,
  entryLabel,
} from '../../../utils/roster.js';
import { ROSTER_COLUMNS, DEFAULT_COLUMNS, statusSummary } from '../../../utils/rosterView.js';
import { companionsLabel } from '../../../utils/companions';

function Badge({ tone, children }) {
  return <span className={`rost-badge rost-tone-${tone}`}>{children}</span>;
}

function Message({ icon, text, role, span }) {
  return (
    <tr>
      <td colSpan={span}>
        <div className="exc-empty" role={role}>
          <span className="exc-symbol">{icon}</span>
          <span>{text}</span>
        </div>
      </td>
    </tr>
  );
}

// One cell per column key. "name" is always first and opens the person's drawer.
function Cell({ column, item, onSelect }) {
  const ticket = item.ticket;
  switch (column) {
    case 'name':
      return (
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
          {item.is_top && (
            <span className="rost-star" title={topLabel(item)} aria-label={topLabel(item)}>
              ★
            </span>
          )}
          <div className="exc-cell-sub num">{item.university_id}</div>
        </td>
      );
    case 'college':
      return (
        <td>
          <div className="exc-cell-main">{item.college_name}</div>
          <div className="exc-cell-sub">{item.major_name || '—'}</div>
        </td>
      );
    case 'status': {
      const status = statusSummary(item);
      return (
        <td>
          <Badge tone={status.tone}>{status.label}</Badge>
          {ticket && ticket.status === 'CONFIRMED' && (
            <div className="exc-cell-sub">{companionsLabel(ticket.companions_count)}</div>
          )}
          {status.sub && <div className="exc-cell-sub">{status.sub}</div>}
        </td>
      );
    }
    case 'top':
      return (
        <td>
          {item.is_top ? <Badge tone="ok">{topLabel(item)}</Badge> : <span className="rost-dash">—</span>}
        </td>
      );
    case 'registration':
      return (
        <td>
          <Badge tone={badgeTone('registration', item.registration.state)}>
            {registrationLabel(item.registration.state)}
          </Badge>
        </td>
      );
    case 'ticket':
      return (
        <td>
          {ticket ? (
            <>
              <Badge tone={badgeTone('ticket', ticket.status)}>{ticketStatusLabel(ticket.status)}</Badge>
              <div className="exc-cell-sub">{companionsLabel(ticket.companions_count)}</div>
            </>
          ) : (
            <span className="rost-dash">لا توجد تذكرة</span>
          )}
        </td>
      );
    case 'payment':
      return (
        <td>
          <Badge tone={badgeTone('payment', item.payment.state)}>{paymentLabel(item.payment.state)}</Badge>
          {item.payment.amount && <div className="exc-cell-sub num">{item.payment.amount}</div>}
          {item.payment.mismatch && <Badge tone="bad">المبلغ غير مطابق</Badge>}
        </td>
      );
    case 'entry':
      return (
        <td>
          <Badge tone={badgeTone('entry', item.entry.entered ? 'entered' : 'not_entered')}>
            {entryLabel(item.entry)}
          </Badge>
        </td>
      );
    default:
      return <td />;
  }
}

export default function RosterTable({ items, loading, error, selectedId, onSelect, columns = DEFAULT_COLUMNS }) {
  const shown = ROSTER_COLUMNS.filter((c) => columns.includes(c.key));
  const span = shown.length;
  return (
    <div className="rost-table-wrap">
      <table className="rost-table">
        <thead>
          <tr>
            {shown.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && items.length === 0 && (
            <Message icon="hourglass_top" text="جارٍ تحميل القائمة..." span={span} />
          )}
          {!loading && error && <Message icon="error" text={error} role="alert" span={span} />}
          {!loading && !error && items.length === 0 && (
            <Message icon="inbox" text="لا توجد نتائج مطابقة للفلاتر الحالية." span={span} />
          )}

          {items.map((item) => (
            <tr
              key={item.record_id}
              className={item.record_id === selectedId ? 'selected' : ''}
              onClick={() => onSelect(item.record_id)}
            >
              {shown.map((c) => (
                <Cell key={c.key} column={c.key} item={item} onSelect={onSelect} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
