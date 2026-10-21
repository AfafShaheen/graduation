import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import AdminAddCeremony from './AdminAddCeremony';
import { getAdminEvent } from './hooks/useAdminEvents.js';
import { ApiError } from '../../api/admin.js';

const toDamascusDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Damascus' });
};

const fmtPrice = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString('en-US');
};

export default function AdminEditCeremonyRoute({
  adminName,
  onNavigate,
  onLogout,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [event, setEvent] = useState(location.state?.eventItem || null);
  const [loading, setLoading] = useState(!location.state?.eventItem);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError('');
    getAdminEvent(id)
      .then((ev) => {
        if (cancel) return;
        setEvent(ev);
      })
      .catch((e) => {
        if (cancel) return;
        if (e instanceof ApiError && e.status === 404) {
          setError('لم يتم العثور على هذا الحفل');
        } else {
          setError(e instanceof ApiError ? e.message : 'حدث خطأ غير متوقع.');
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', direction: 'rtl' }}>
        جارٍ تحميل بيانات الحفل...
      </div>
    );
  }

  if (error || !event) {
    return (
      <div style={{ padding: 24, textAlign: 'center', direction: 'rtl' }}>
        <p style={{ color: '#ba1a1a', fontWeight: 700 }}>{error || 'لم يتم العثور على هذا الحفل'}</p>
        <button type="button" onClick={() => navigate('/admin/ceremonies')}>
          العودة لقائمة الحفلات
        </button>
      </div>
    );
  }

  const ceremony = {
    id: event.id,
    ceremonyName: event.name || '',
    ceremonyDate: event.event_date
      ? `${event.event_date.slice(0, 10)}T${event.event_time ? event.event_time.slice(0, 5) : '00:00'}`
      : '',
    startDate: toDamascusDate(event.registration_start),
    endDate: toDamascusDate(event.registration_end),
    whatsappLink: event.whatsapp_group_link || '',
    packages: Array.isArray(event.packages)
      ? event.packages.map((p, index) => ({
          id: `pkg-${index}`,
          companions: String(p.companions_count ?? ''),
          price: fmtPrice(p.price),
        }))
      : [],
    collegeNames: Array.isArray(event.colleges)
      ? event.colleges.map((c) => c.name).filter(Boolean)
      : [],
  };

  const registrationStarted = (() => {
    if (!event.registration_start) return false;
    const start = new Date(event.registration_start);
    if (isNaN(start.getTime())) return false;
    return Date.now() >= start.getTime();
  })();

  return (
    <AdminAddCeremony
      adminName={adminName}
      ceremony={ceremony}
      eventId={event.id}
      registrationStarted={registrationStarted}
      onNavigate={onNavigate}
      onCancel={() => navigate('/admin/ceremonies')}
      onSubmitSuccess={() => navigate('/admin/ceremonies')}
      onLogout={onLogout}
    />
  );
}
