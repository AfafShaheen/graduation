import React, { useEffect } from 'react';
import '../style/BottomSheet.css';
import useDialogA11y from '../hooks/useDialogA11y';

/*
 * A short message that rises from the bottom over the page (which stays visible behind it): for one
 * brief rule at the moment of a decision. Not for long reading. Escape or a tap outside closes it.
 */
export default function BottomSheet({ open, title, children, onClose }) {
  useDialogA11y(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bs-overlay" onClick={onClose}>
      <div
        className="bs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bs-grab" aria-hidden="true"></div>
        <h2 className="bs-title" id="bs-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
