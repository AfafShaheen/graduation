import React from 'react';
import '../style/LoadError.css';

// Shown instead of the page when a request failed for a reason that is not the session
// (no network, the server is busy): the graduate stays signed in and can simply try again.
export default function LoadError({ onRetry, onLogin }) {
  return (
    <div className="le" role="alert">
      <div className="le-card">
        <h2 className="le-title">تعذّر تحميل حالتك</h2>
        <p className="le-text">تحقق من اتصالك بالإنترنت ثم أعد المحاولة. بياناتك محفوظة.</p>
        <button type="button" className="le-retry" onClick={onRetry}>إعادة المحاولة</button>
        <button type="button" className="le-link" onClick={onLogin}>العودة إلى صفحة الدخول</button>
      </div>
    </div>
  );
}
