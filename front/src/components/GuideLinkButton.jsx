import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../style/GuideLinkButton.css';

/*
 * زر موحّد لفتح صفحات الإرشادات من أي صفحة خريج (نفس الشكل في كل مكان).
 * يمرّر الصفحة الحالية في state.from حتى ترجع صفحة الإرشادات إليها بعد القراءة.
 */
export default function GuideLinkButton({ to, label, className = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button
      type="button"
      className={`guide-link-btn ${className}`.trim()}
      onClick={() => navigate(to, { state: { from: location.pathname } })}
    >
      <span className="guide-link-btn-icon" aria-hidden="true">menu_book</span>
      <span>{label}</span>
    </button>
  );
}
