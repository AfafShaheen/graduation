import React, { useEffect } from 'react';
import useDialogA11y from '../hooks/useDialogA11y';

/*
 * "Are you sure?" step before the payment data is sent. It shows what the graduate typed so he
 * can check it; "تعديل المعلومات" closes it (Escape too) and "نعم، أرسل" sends.
 */
export default function PaymentConfirmDialog({ open, rows, busy, onConfirm, onCancel }) {
  useDialogA11y(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="sc-confirm-overlay" onClick={() => !busy && onCancel()}>
      <div
        className="sc-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="sc-confirm-title" id="sc-confirm-title">
          هل أنت متأكد من صحة المعلومات؟
        </h2>
        <dl className="sc-confirm-list">
          {rows.map((row) => (
            <div key={row.label} className="sc-confirm-row">
              <dt>{row.label}</dt>
              <dd dir={row.ltr ? 'ltr' : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="sc-confirm-note">راجع المعلومات جيداً، فالخطأ فيها قد يؤدي إلى رفض الدفع.</p>
        <div className="sc-confirm-actions">
          <button type="button" className="sc-confirm-yes" disabled={busy} onClick={onConfirm}>
            {busy ? 'جارٍ الإرسال...' : 'نعم، أرسل'}
          </button>
          <button type="button" className="sc-confirm-no" disabled={busy} onClick={onCancel}>
            تعديل المعلومات
          </button>
        </div>
      </div>
    </div>
  );
}
