import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../style/LoadError.css';
import UnionBrand from '../components/UnionBrand';

// An address that does not exist: say so, and give one clear way back.
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="le">
      <main className="le-card">
        <UnionBrand />
        <h2 className="le-title" style={{ marginTop: 14 }}>الصفحة غير موجودة</h2>
        <p className="le-text">ربما كُتب الرابط بشكل خاطئ أو لم تعد الصفحة متاحة.</p>
        <button type="button" className="le-retry" onClick={() => navigate('/', { replace: true })}>
          العودة إلى الصفحة الرئيسية
        </button>
      </main>
    </div>
  );
}
