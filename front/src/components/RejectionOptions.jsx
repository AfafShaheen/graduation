// خيارات الخريج بعد رفض الطلب: عنوان وزر «إعادة الدفع».
// كل منطق الإظهار في utils/rejection.js (دوال نقية قابلة للاختبار)؛ هنا عرض فقط.
// تُعاد استخدام أصناف or-* الموجودة في style/OrderRejected.css مع إضافة القليل فقط.
import React from 'react';
import { rejectionActions } from '../utils/rejection';

export default function RejectionOptions({ registrationOpen, phone, onResubmit }) {
  const { canResubmit, showClosedNotice } = rejectionActions({
    registrationOpen,
    phone,
  });

  return (
    <div className="or-options" role="group" aria-label="خيارات ما بعد الرفض">
      <h3 className="or-options-title">ماذا تريد أن تفعل؟</h3>

      {canResubmit && (
        <button className="or-resubmit-btn" type="button" onClick={onResubmit}>
          <span className="or-symbol" style={{ fontSize: '20px' }} aria-hidden="true">
            refresh
          </span>
          <span>إعادة الدفع</span>
        </button>
      )}

      {showClosedNotice && (
        <p className="or-closed-notice">انتهت فترة التسجيل، لم يعد إعادة الدفع متاحاً.</p>
      )}
    </div>
  );
}
