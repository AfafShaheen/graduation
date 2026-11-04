import React from 'react';
import '../style/EndedNotice.css';

// A short note shown on a graduate page once the ceremony is over.
export default function EndedNotice({ children }) {
  return (
    <section className="ended-notice" role="status">
      <strong>انتهى الحفل.</strong> {children}
    </section>
  );
}
