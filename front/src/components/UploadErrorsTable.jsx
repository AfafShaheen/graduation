import React from 'react';

// The errors of a failed import: row, field, the value found in the file and what is wrong.
export default function UploadErrorsTable({ errors, count, onDownload }) {
  const th = { textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' };
  const td = { padding: '4px 8px', borderBottom: '1px solid #eee' };
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={th}>الصف</th>
              <th style={th}>الحقل</th>
              <th style={th}>القيمة الموجودة</th>
              <th style={th}>المشكلة</th>
            </tr>
          </thead>
          <tbody>
            {errors.slice(0, 50).map((e, i) => (
              <tr key={i}>
                <td style={td}>{e?.row ?? '—'}</td>
                <td style={td}>{e?.field ?? '—'}</td>
                <td style={td}>{e?.value || 'فارغة'}</td>
                <td style={td}>{e?.message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > 50 && <p style={{ margin: '8px 0' }}>و {count - 50} خطأ آخر</p>}
      {onDownload && (
        <button type="button" className="uf-btn ghost" onClick={onDownload} style={{ marginTop: '8px' }}>
          تنزيل الأخطاء (CSV)
        </button>
      )}
    </>
  );
}
