import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../style/StageHeader.css';
import unionLogo from '../assets/only-logo.png';
import { CEREMONY_TITLE, BATCH_BADGE } from '../config/brand';
import { stageTabs } from '../utils/stageTabs';
import { guidePath, pathForStage } from '../utils/stage';
import { logoutGraduate } from '../api/graduate';
import { clearGraduateSession, getGraduateToken, hasGraduateSession } from '../api/session';

/*
 * The top of every graduate page of the journey: the brand header, the "إرشادات" button
 * and the four tabs (التسجيل / الباقة / الدفع / التذكرة).
 *
 *  current          register | package | payment | ticket
 *  sub              small text under the tabs ("الخطوة 2 من 4", "قيد المراجعة", ...)
 *  guide            "before" (registration guide) or the stage whose guide the button opens
 *  onBack           leading arrow button (optional)
 *  action           { label, icon, onClick } trailing button, e.g. share (optional)
 *  canChangePackage the package tab can be opened again (payment pages only)
 */
export default function StageHeader({ current, sub = '', guide, onBack, action, canChangePackage = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!note) return undefined;
    const timer = setTimeout(() => setNote(''), 3500);
    return () => clearTimeout(timer);
  }, [note]);

  // sign out of this phone (a shared phone must not stay open on his ticket)
  const signOut = async () => {
    try {
      await logoutGraduate(getGraduateToken());
    } catch {
      /* the server could not be reached: the session is still removed here */
    }
    clearGraduateSession();
    navigate('/login', { replace: true });
  };

  const tabs = stageTabs(current, { canChangePackage });
  const openGuide = () => {
    const target = guide === 'before' ? '/guide/start' : guidePath(guide);
    navigate(target, { state: { from: location.pathname } });
  };

  const leading = onBack ? (
    <button type="button" className="sh-icon" aria-label="رجوع" onClick={onBack}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
    </button>
  ) : action ? (
    <span className="sh-icon static">
      <img className="sh-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
    </span>
  ) : (
    <span className="sh-icon static" aria-hidden="true"></span>
  );

  const trailing = action ? (
    <button type="button" className="sh-icon" aria-label={action.label} onClick={action.onClick}>
      <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
    </button>
  ) : (
    <span className="sh-icon static">
      <img className="sh-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
    </span>
  );

  return (
    <>
      <header className="sh-header">
        <div className="sh-top">
          {leading}
          <h1 className="sh-title">{CEREMONY_TITLE}</h1>
          {trailing}
        </div>
        <div className="sh-subband">
          <span className="sh-badge">{BATCH_BADGE}</span>
          <span className="sh-actions">
            {guide && (
              <button type="button" className="sh-guide" onClick={openGuide}>
                <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                <span>إرشادات</span>
              </button>
            )}
            {hasGraduateSession() && (
              <button type="button" className="sh-guide" onClick={signOut}>
                <span className="material-symbols-outlined" aria-hidden="true">logout</span>
                <span>خروج</span>
              </button>
            )}
          </span>
        </div>
      </header>

      <nav className="sh-tabs-wrap" aria-label="مراحل الحجز">
        <ol className="sh-tabs">
          {tabs.map((tab) => (
            <li key={tab.key} className={`sh-tab ${tab.state}`}>
              {tab.state === 'done' ? (
                <button
                  type="button"
                  className="sh-tab-btn"
                  aria-disabled={!tab.clickable}
                  onClick={() => (tab.clickable ? navigate(pathForStage('package')) : setNote(tab.note))}
                >
                  <span className="material-symbols-outlined sh-check" aria-hidden="true">check</span>
                  {tab.label}
                </button>
              ) : (
                <span className="sh-tab-btn" aria-current={tab.state === 'current' ? 'step' : undefined}>
                  {tab.label}
                </span>
              )}
            </li>
          ))}
        </ol>
        {sub && <p className="sh-sub">{sub}</p>}
        {note && (
          <p className="sh-note" role="status">
            {note}
          </p>
        )}
      </nav>
    </>
  );
}
