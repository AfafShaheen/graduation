import React from 'react';

// A small "i" that shows the definition of a number on hover or keyboard focus.
export default function InfoTip({ text, label = 'ما معنى هذا الرقم؟' }) {
  if (!text) return null;
  return (
    <span className="st2-tip">
      <button type="button" className="st2-tip-btn" aria-label={label}>
        i
      </button>
      <span role="tooltip" className="st2-tip-box">
        {text}
      </span>
    </span>
  );
}
