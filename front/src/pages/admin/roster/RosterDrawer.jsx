import React, { useCallback, useEffect, useRef, useState } from 'react';
import { namesOf, nameDraftError } from '../../../utils/graduateNames.js';
import {
  getGraduateDetail,
  manualCheckIn,
  revertScan,
  revertPayment,
  updateGraduateEmail,
  updateGraduateName,
  verifyGraduateEmail,
} from '../hooks/useAdminGraduates.js';
import { ApiError } from '../../../api/admin.js';
import {
  badgeTone,
  registrationLabel,
  ticketStatusLabel,
  paymentLabel,
  topLabel,
  entryLabel,
} from '../../../utils/roster.js';
import { companionsLabel } from '../../../utils/companions';
import useDialogA11y from '../../../hooks/useDialogA11y';

const QR_TYPE_LABELS = { GRADUATE: 'رمز الخريج', COMPANION: 'رمز مرافق' };

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Damascus',
  }).format(d);
};

// The exceptional actions. Whether each one is allowed comes from the
// roster row (`actions`), so the rules live in the API only.
const ACTIONS = [
  {
    key: 'manual_entry',
    label: 'تسجيل دخول يدوي',
    icon: 'how_to_reg',
    tone: 'primary',
    confirm: 'سيُسجَّل دخول الخريج يدوياً وتُفعَّل رموز مرافقيه.',
    blocked: 'متاح فقط للتذكرة المؤكدة التي لم يُمسح رمزها بعد.',
    run: (row) => manualCheckIn(row.registration.graduate_id),
    done: 'تم تسجيل الدخول اليدوي.',
  },
  {
    key: 'cancel_scan',
    label: 'إلغاء المسح',
    icon: 'restart_alt',
    tone: '',
    confirm: 'سيُلغى مسح الخريج وتُعطَّل رموز مرافقيه إلى أن يُمسح من جديد.',
    blocked: 'متاح فقط إذا كان الخريج مسجّل الدخول.',
    run: (row) => revertScan(row.registration.graduate_id),
    done: 'تم إلغاء المسح السابق.',
  },
  {
    key: 'revert_payment',
    label: 'إرجاع الدفع لقيد المعالجة',
    icon: 'pending',
    tone: 'warn',
    confirm:
      'ستعود التذكرة إلى «قيد المعالجة» ويختفي الباركود عن الخريج إلى أن تؤكّدي الدفع من جديد.',
    blocked: 'متاح فقط للتذكرة المؤكدة.',
    run: (row) => revertPayment(row.ticket.id),
    done: 'تم إرجاع الدفع لقيد المعالجة.',
  },
  {
    key: 'verify_email',
    label: 'تأكيد الإيميل',
    icon: 'verified_user',
    tone: '',
    // The confirmation panel shows the e-mail itself (dir="ltr") before this
    // sentence; see the `pending` panel below.
    confirm:
      'سيُعتمد هذا البريد كمؤكَّد بدون رمز، وسيتمكن الخريج من تسجيل الدخول مباشرة. تأكّد أن البريد صحيح ويخص الخريج.',
    showEmail: true,
    email: (row) => row.registration.email || '',
    blocked: 'متاح فقط لحساب لم يؤكد بريده بعد.',
    run: (row) => verifyGraduateEmail(row.registration.graduate_id),
    done: 'تم تأكيد البريد الإلكتروني للخريج، ويمكنه تسجيل الدخول الآن.',
  },
];

const NAME_FIELDS = [
  ['firstName', 'الاسم'],
  ['lastName', 'الكنية'],
  ['fatherName', 'اسم الأب'],
  ['motherName', 'اسم الأم'],
];
const EMPTY_NAMES = { firstName: '', lastName: '', fatherName: '', motherName: '' };

export default function RosterDrawer({ row, stale, onClose, onChanged, onNotice }) {
  useDialogA11y(true);
  const graduateId = row.registration.graduate_id;
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(EMPTY_NAMES);
  const closeRef = useRef(null);
  const latest = useRef(0);

  const loadDetail = useCallback(async () => {
    if (!graduateId) return;
    const id = ++latest.current;
    setDetailError('');
    try {
      const res = await getGraduateDetail(graduateId);
      if (latest.current === id) setDetail(res);
    } catch (e) {
      if (latest.current === id) {
        setDetail(null);
        setDetailError(e instanceof ApiError ? e.message : 'تعذّر تحميل تفاصيل الخريج.');
      }
    }
  }, [graduateId]);

  // The drawer is remounted for every row (see ``key`` in RosterTab), so its
  // local state always starts clean and only the details need loading.
  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const execute = async (action) => {
    setBusy(true);
    setError('');
    try {
      const res = await action.run(row);
      onNotice(res?.message || action.done);
      setPending(null);
      await onChanged();
      await loadDetail();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تنفيذ الإجراء، حاول مجدداً.');
    } finally {
      setBusy(false);
    }
  };

  const openNameEdit = () => {
    setEditingEmail(false);
    setNameDraft(namesOf(detail, row));
    setEditingName((v) => !v);
  };

  const saveName = async (e) => {
    e.preventDefault();
    const problem = nameDraftError(nameDraft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await updateGraduateName(graduateId, nameDraft);
      onNotice(res?.message || 'تم تحديث الاسم.');
      setEditingName(false);
      await onChanged();
      await loadDetail();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحديث الاسم.');
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email) return;
    setBusy(true);
    setError('');
    try {
      const res = await updateGraduateEmail(graduateId, email);
      onNotice(res?.message || 'تم تحديث البريد الإلكتروني.');
      setEditingEmail(false);
      await onChanged();
      await loadDetail();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحديث البريد.');
    } finally {
      setBusy(false);
    }
  };

  const ticket = row.ticket;
  const ticketDetail = detail?.tickets?.[0] || null;
  const registered = Boolean(graduateId);

  return (
    <div className="rost-overlay" role="presentation" onClick={onClose}>
      <aside
        className="rost-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`بيانات ${row.full_name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rost-drawer-head">
          <div>
            <h4>{row.full_name}</h4>
            <span className="exc-cell-sub num">{row.university_id}</span>
          </div>
          <button
            type="button"
            ref={closeRef}
            className="rost-close"
            aria-label="إغلاق"
            onClick={onClose}
          >
            <span className="exc-symbol">close</span>
          </button>
        </header>

        <div className="rost-drawer-body">
          <div className="rost-badges">
            <span className={`rost-badge rost-tone-${badgeTone('registration', row.registration.state)}`}>
              {registrationLabel(row.registration.state)}
            </span>
            <span className={`rost-badge rost-tone-${badgeTone('payment', row.payment.state)}`}>
              الدفع: {paymentLabel(row.payment.state)}
            </span>
            <span className={`rost-badge rost-tone-${row.entry.entered ? 'ok' : 'muted'}`}>
              {entryLabel(row.entry)}
            </span>
          </div>

          <h5 className="rost-section-title">بيانات الشؤون</h5>
          <div className="exc-info-grid">
            <div>
              <span className="exc-info-label">الكلية</span>
              <div className="exc-info-value">{row.college_name}</div>
              <span className="exc-info-sub">{row.major_name || 'بدون تخصص'}</span>
            </div>
            <div>
              <span className="exc-info-label">اسم الأب / الأم</span>
              <div className="exc-info-value">{row.father_name}</div>
              <span className="exc-info-sub">{row.mother_name}</span>
            </div>
            <div>
              <span className="exc-info-label">الجنس / المعدل</span>
              <div className="exc-info-value">{row.gender}</div>
              <span className="exc-info-sub num">{row.gpa || '—'}</span>
            </div>
            <div>
              <span className="exc-info-label">الأوائل</span>
              <div className="exc-info-value">{topLabel(row)}</div>
            </div>
            <div>
              <span className="exc-info-label">الحفل</span>
              <div className="exc-info-value">{row.event_name}</div>
            </div>
          </div>

          {registered && (
            <>
              <h5 className="rost-section-title">الحساب</h5>
              <div className="exc-info-grid">
                <div>
                  <span className="exc-info-label">البريد الإلكتروني</span>
                  <div className="exc-info-value ltr">{row.registration.email || '—'}</div>
                  <span className="exc-info-sub">
                    {row.registration.email_verified ? 'تم تأكيده بالـ OTP' : 'لم يُؤكَّد بعد'}
                  </span>
                </div>
                <div>
                  <span className="exc-info-label">الهاتف</span>
                  <div className="exc-info-value ltr">{detail?.phone || '—'}</div>
                </div>
              </div>
            </>
          )}

          {ticket && (
            <>
              <h5 className="rost-section-title">التذكرة والدفع</h5>
              <div className="exc-info-grid">
                <div>
                  <span className="exc-info-label">الحالة</span>
                  <div className="exc-info-value">{ticketStatusLabel(ticket.status)}</div>
                  <span className="exc-info-sub num">رقم التذكرة: {ticket.id}</span>
                </div>
                <div>
                  <span className="exc-info-label">الفئة والسعر</span>
                  <div className="exc-info-value">{companionsLabel(ticket.companions_count)}</div>
                  <span className="exc-info-sub num">{ticket.price || '—'}</span>
                </div>
                
                {ticketDetail?.rejection_reason && (
                  <div>
                    <span className="exc-info-label">سبب الرفض</span>
                    <div className="exc-info-value">{ticketDetail.rejection_reason}</div>
                  </div>
                )}
                {ticketDetail?.confirmed_at && (
                  <div>
                    <span className="exc-info-label">تاريخ التثبيت</span>
                    <div className="exc-info-value">{formatDateTime(ticketDetail.confirmed_at)}</div>
                  </div>
                )}
              </div>

              {(detail?.payments || []).length > 0 && (
                <div className="rost-list">
                  <span className="exc-info-label">سجل الدفعات</span>
                  {detail.payments.map((p) => (
                    <span key={p.id} className="exc-info-sub">
                      {p.sender_name || '—'} — {p.amount ?? '—'} — {formatDateTime(p.submitted_at)}
                      {p.reviewed_at ? ` (روجعت ${formatDateTime(p.reviewed_at)})` : ''}
                    </span>
                  ))}
                </div>
              )}

              {(detail?.qr_codes || []).length > 0 && (
                <div className="rost-list">
                  <span className="exc-info-label">رموز QR</span>
                  {detail.qr_codes.map((qr) => (
                    <span key={qr.id} className={`exc-pay-chip ${qr.is_activated ? 'confirmed' : 'pending'}`}>
                      {QR_TYPE_LABELS[qr.code_type] || qr.code_type}:{' '}
                      {qr.scanned ? 'تم مسحه' : qr.is_activated ? 'مُفعّل' : 'غير مُفعّل'}
                      {qr.scanned_by_username ? ` (${qr.scanned_by_username})` : ''}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {detailError && (
            <div className="exc-alert" role="alert">
              <span className="exc-symbol">error</span>
              <p style={{ margin: 0 }}>{detailError}</p>
            </div>
          )}

          <h5 className="rost-section-title">الإجراءات الاستثنائية</h5>

          {!registered && (
            <p className="rost-note">
              لم يسجّل هذا الشخص بعد، فلا توجد إجراءات متاحة له. بيانات الشؤون أعلاه هي التي ستُطابَق
              عند تسجيله.
            </p>
          )}

          {registered && stale && (
            <p className="rost-note">
              هذا الصف لم يعد ضمن الفلاتر الحالية. أغلقي النافذة أو أعيدي ضبط الفلاتر لمتابعة الإجراءات.
            </p>
          )}

          {registered && (
            <div className="exc-actions-grid">
              {ACTIONS.map((action) => {
                const allowed = Boolean(row.actions[action.key]) && !stale;
                return (
                  <button
                    key={action.key}
                    type="button"
                    className={`exc-action-btn ${action.tone}`.trim()}
                    disabled={busy || !allowed}
                    title={allowed ? '' : action.blocked}
                    onClick={() => setPending(action)}
                  >
                    <span className="exc-symbol">{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className="exc-action-btn"
                disabled={busy || stale}
                onClick={() => {
                  setEditingName(false);
                  setEmailDraft(row.registration.email || '');
                  setEditingEmail((v) => !v);
                }}
              >
                <span className="exc-symbol">mark_email_read</span>
                <span>تعديل البريد</span>
              </button>
              <button type="button" className="exc-action-btn" disabled={busy || stale || !detail} onClick={openNameEdit}>
                <span className="exc-symbol">badge</span>
                <span>تعديل الاسم</span>
              </button>
            </div>
          )}

          {pending && (
            <div className="rost-confirm" role="alertdialog" aria-label="تأكيد الإجراء">
              <p>
                <strong>{pending.label}</strong>
                <br />
                {pending.showEmail ? (
                  <>
                    <span dir="ltr" className="rost-confirm-email">
                      {pending.email(row)}
                    </span>
                    <br />
                  </>
                ) : null}
                {pending.confirm}
              </p>
              <div className="rost-confirm-buttons">
                <button type="button" className="rost-btn solid" disabled={busy} onClick={() => execute(pending)}>
                  {busy ? 'جارٍ التنفيذ...' : 'تأكيد التنفيذ'}
                </button>
                <button type="button" className="rost-btn" disabled={busy} onClick={() => setPending(null)}>
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {editingEmail && (
            <form className="exc-email-form" onSubmit={saveEmail}>
              <input
                type="email"
                dir="ltr"
                className="rost-input"
                aria-label="البريد الإلكتروني الجديد"
                placeholder="البريد الإلكتروني الجديد"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                required
              />
              <div className="exc-email-actions">
                <button type="submit" className="exc-btn-small solid" disabled={busy}>
                  حفظ البريد
                </button>
                <button type="button" className="exc-btn-small" onClick={() => setEditingEmail(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {editingName && (
            <form className="exc-email-form exc-name-form" onSubmit={saveName}>
              <p className="exc-card-sub" style={{ margin: 0 }}>
                الأسماء كما ستُطبع على الشهادة. التشكيل والمسافات الزائدة تُزال تلقائياً.
              </p>
              {NAME_FIELDS.map(([key, label]) => (
                <label key={key} className="rost-field">
                  <span>{label}</span>
                  <input
                    type="text"
                    className="rost-input"
                    value={nameDraft[key]}
                    maxLength={100}
                    onChange={(e) => setNameDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                    required
                  />
                </label>
              ))}
              <div className="exc-email-actions">
                <button type="submit" className="exc-btn-small solid" disabled={busy}>
                  حفظ الاسم
                </button>
                <button type="button" className="exc-btn-small" onClick={() => setEditingName(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {error && (
            <div className="exc-alert" role="alert">
              <span className="exc-symbol">error</span>
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
