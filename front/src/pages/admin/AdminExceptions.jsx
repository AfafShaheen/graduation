import React, { useState, useEffect, useMemo } from 'react';
import '../../style/AdminExceptions.css';
import AdminSidebar from '../../components/AdminSidebar';

/* ==========================================================================
   بيانات تجريبية: لما يجهز الباك إند بدّلها ببيانات حقيقية (عبر props)
   ========================================================================== */
const TICKETS = [
  {
    id: 'ENG-88291',
    name: 'كنان محمد العلي',
    email: 'k.alali@baath-edu.sy',
    college: 'الهندسة الميكانيكية والكهربائية',
    department: 'قسم هندسة الحواسيب والتحكم',
    year: 'سنة خامسة تخرج',
    ticketType: 'خريج + 2 مرافقين',
    seats: 'المدرج A — صف 4 (كراسي 12، 13، 14)',
    form: '#HOMS-2024-88291',
    payment: 'confirmed',
    scanned: true,
    scanTime: '16:35',
  },
  {
    id: 'MED-11024',
    name: 'سارة أحمد المحمود',
    email: 's.mahmoud@baath-edu.sy',
    college: 'الطب البشري',
    department: 'قسم الطب السريري',
    year: 'سنة سادسة تخرج',
    ticketType: 'خريج + 3 مرافقين',
    seats: 'المدرج B — صف 2 (كراسي 5، 6، 7، 8)',
    form: '#HOMS-2024-11024',
    payment: 'confirmed',
    scanned: false,
    scanTime: '',
  },
  {
    id: 'CIV-40912',
    name: 'مجد وسيم طه',
    email: 'm.taha@baath-edu.sy',
    college: 'الهندسة المدنية',
    department: 'قسم هندسة الإنشاءات',
    year: 'سنة خامسة تخرج',
    ticketType: 'خريج + 2 مرافقين',
    seats: 'المدرج A — صف 7 (كراسي 1، 2، 3)',
    form: '#HOMS-2024-40912',
    payment: 'confirmed',
    scanned: true,
    scanTime: '16:15',
  },
];

const INITIAL_LOGS = [
  {
    executorName: 'م. حسام العلي',
    executorRole: 'مشرف البوابة الرئيسية',
    actionName: 'تسجيل دخول يدوي',
    actionDesc: 'عطل في كاميرا ماسح البوابة B',
    beneficiaryName: 'كنان محمد العلي',
    ticketId: 'ENG-88291',
    time: '28 أيلول 2024 — 16:40:12',
  },
  {
    executorName: 'رنا السليمان',
    executorRole: 'لجنة تدقيق البطاقات',
    actionName: 'تعديل بريد إلكتروني',
    actionDesc: 'إعادة إرسال QR للبريد الجامعي البديل',
    beneficiaryName: 'سارة أحمد المحمود',
    ticketId: 'MED-11024',
    time: '28 أيلول 2024 — 16:32:05',
  },
  {
    executorName: 'علي الجاسم',
    executorRole: 'مسؤول التقنيات والربط',
    actionName: 'فك قفل المسح (إلغاء مسح مكرر)',
    actionDesc: 'تزامن خاطئ عند جهاز البوابة A',
    beneficiaryName: 'مجد وسيم طه',
    ticketId: 'CIV-40912',
    time: '28 أيلول 2024 — 16:15:48',
  },
  {
    executorName: 'م. حسام العلي',
    executorRole: 'مشرف البوابة الرئيسية',
    actionName: 'إرجاع الدفع لقيد المعالجة',
    actionDesc: 'طلب تدقيق إيصال بنكي باليد',
    beneficiaryName: 'لين باسل حيدر',
    ticketId: 'ARCH-3309',
    time: '28 أيلول 2024 — 15:58:20',
  },
];

const QUICK_FILTERS = ['الهندسة الميكانيكية', 'ممسوحة', 'الطب البشري'];

const nowLabel = () =>
  new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Damascus',
  }).format(new Date());

const initialsOf = (name) =>
  name
    .replace(/^(م\.|د\.|أ\.)\s*/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('.');

export default function AdminExceptions({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  tickets = TICKETS,
  onManualEntry,
  onCancelScan,
  onReturnToPending,
  onEditEmail,
  onAddTicket,
  onNavigate,
  onLogout,
}) {
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [list, setList] = useState(tickets);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');

  useEffect(() => {
    setList(tickets);
  }, [tickets]);

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // إخفاء الإشعار تلقائياً
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const query = searchQuery.trim().toLowerCase();

  const ticket = useMemo(() => {
    if (!query) return null;
    return (
      list.find((t) => {
        const haystack = [
          t.id,
          t.name,
          t.college,
          t.scanned ? 'ممسوحة' : 'غير ممسوحة',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      }) || null
    );
  }, [list, query]);

  // إغلاق نموذج البريد عند تغيير التذكرة المعروضة
  useEffect(() => {
    setEditingEmail(false);
  }, [ticket?.id]);

  const addLog = (t, actionName, actionDesc) => {
    setLogs((prev) => [
      {
        executorName: adminName,
        executorRole: adminRole,
        actionName,
        actionDesc,
        beneficiaryName: t.name,
        ticketId: t.id,
        time: nowLabel(),
      },
      ...prev,
    ]);
  };

  const updateTicket = (id, patch) =>
    setList((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const handleManualEntry = () => {
    updateTicket(ticket.id, { scanned: true, scanTime: nowLabel() });
    addLog(ticket, 'تسجيل دخول يدوي', 'تسجيل الدخول يدوياً بقرار المشرف');
    if (onManualEntry) onManualEntry(ticket);
    setNotice(`تم تسجيل دخول ${ticket.name} يدوياً`);
  };

  const handleCancelScan = () => {
    updateTicket(ticket.id, { scanned: false, scanTime: '' });
    addLog(ticket, 'إلغاء مسح خاطئ', 'فك قفل المسح لإعادة المسح من جديد');
    if (onCancelScan) onCancelScan(ticket);
    setNotice(`تم إلغاء المسح السابق لتذكرة ${ticket.id}`);
  };

  const handleReturnPending = () => {
    updateTicket(ticket.id, { payment: 'pending' });
    addLog(ticket, 'إرجاع الدفع لقيد المعالجة', 'طلب إعادة تدقيق الدفع');
    if (onReturnToPending) onReturnToPending(ticket);
    setNotice(`تم إرجاع دفع ${ticket.name} لقيد المعالجة`);
  };

  const handleSaveEmail = (e) => {
    e.preventDefault();
    const email = emailDraft.trim();
    if (!email) return;
    updateTicket(ticket.id, { email });
    addLog(ticket, 'تعديل بريد إلكتروني', `تغيير البريد إلى ${email}`);
    if (onEditEmail) onEditEmail(ticket, email);
    setEditingEmail(false);
    setNotice('تم تحديث البريد الإلكتروني');
  };

  return (
    <div className="exc-app-container">
      <div className="exc-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="actions"
        onAddTicket={onAddTicket}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="exc-topbar">
        <button
          type="button"
          className="exc-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="exc-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="exc-topbar-title">
          <h2>إجراءات استثنائية</h2>
          <span>جامعة حمص • بوابة الإشراف المباشر</span>
        </div>

        <div className="exc-topbar-actions">
          <div className="exc-clock-pill">
            <span className="exc-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>schedule</span>
            <span>{nowLabel()}</span>
          </div>

          <button aria-label="التنبيهات" className="exc-icon-btn" title="التنبيهات" type="button">
            <span className="exc-symbol">notifications</span>
            <span className="exc-notif-dot"></span>
          </button>

          <button className="exc-help-btn" type="button">
            <span className="exc-symbol" style={{ fontSize: '18px' }}>help_outline</span>
            <span className="exc-help-text">المساعدة والدعم</span>
          </button>
        </div>
      </header>

      {/* المحتوى */}
      <main className="exc-main-canvas">
        <section className="exc-hero-titles">
          <div className="exc-pulse-tag">
            <span className="exc-mini-dot"></span>
            <span className="exc-pulse-label">إجراءات استثنائية</span>
            <span className="exc-pulse-venue">• مدرج الباسل — حمص</span>
          </div>
          <h3>طوارئ الدخول وتصحيح حالات التذاكر</h3>
          <p>ابحث عن تذكرة خريج للتعامل مع أعطال الماسحات أو المسح المكرر، وكل إجراء بيتسجل تلقائياً باسمك بالسجل الرقابي.</p>
        </section>

        {notice && (
          <div className="exc-notice" role="status">
            <span className="exc-symbol" style={{ fontSize: '18px' }}>check_circle</span>
            <span>{notice}</span>
          </div>
        )}

        {/* البحث */}
        <section className="exc-card">
          <h4 className="exc-card-title">البحث الفوري عن تذكرة خريج</h4>
          <p className="exc-card-sub">دوّر بالاسم أو الرقم الجامعي أو الكلية، وبتظهر التذكرة مباشرة.</p>

          <div className="exc-search-row">
            <div className="exc-search-box">
              <input
                type="text"
                autoComplete="off"
                className="exc-input"
                placeholder="مثال: ENG-88291 أو كنان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="exc-symbol exc-input-icon" style={{ fontSize: '22px' }}>search</span>
            </div>

            <button type="button" className="exc-btn-primary" onClick={() => setSearchQuery((q) => q.trim())}>
              <span className="exc-symbol" style={{ fontSize: '20px' }}>qr_code_scanner</span>
              <span>فحص مباشر</span>
            </button>
          </div>

          <div className="exc-quick">
            <span className="exc-quick-label">عمليات بحث سريعة:</span>
            {QUICK_FILTERS.map((f) => (
              <button key={f} type="button" className="exc-quick-btn" onClick={() => setSearchQuery(f)}>
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* التذكرة */}
        {!query && (
          <section className="exc-card">
            <div className="exc-empty">
              <span className="exc-symbol">manage_search</span>
              <span>اكتب اسم الخريج أو رقمه الجامعي لعرض التذكرة والإجراءات المتاحة</span>
            </div>
          </section>
        )}

        {query && !ticket && (
          <section className="exc-card">
            <div className="exc-empty">
              <span className="exc-symbol">search_off</span>
              <span>ما في تذكرة مطابقة لـ "{searchQuery.trim()}"</span>
            </div>
          </section>
        )}

        {ticket && (
          <section className="exc-card flush">
            <div className="exc-ticket-head">
              <div className="exc-ticket-head-main">
                <div className="exc-ticket-head-icon">
                  <span className="exc-symbol">school</span>
                </div>
                <div>
                  <h4>
                    <span>بطاقة تذكرة الخريج المعتمدة</span>
                    <span className="exc-batch-pill">دفعة 2024</span>
                  </h4>
                  <p>رقم الاستمارة الإلكترونية: {ticket.form}</p>
                </div>
              </div>

              <span className="exc-scan-pill">
                <span className="exc-symbol" style={{ fontSize: '18px' }}>
                  {ticket.scanned ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span>{ticket.scanned ? 'ممسوحة (مؤكدة)' : 'غير ممسوحة بعد'}</span>
              </span>
            </div>

            <div className="exc-ticket-body">
              <div className="exc-info-grid">
                <div>
                  <span className="exc-info-label">اسم الخريج</span>
                  <div className="exc-info-value">
                    <span>{ticket.name}</span>
                    <span className="exc-symbol" style={{ color: '#ca4b00', fontSize: '18px' }}>verified</span>
                  </div>
                  <span className="exc-info-sub">البريد: {ticket.email}</span>
                </div>

                <div>
                  <span className="exc-info-label">الرقم الجامعي</span>
                  <div className="exc-info-value ltr">{ticket.id}</div>
                  <span className="exc-info-sub">{ticket.year}</span>
                </div>

                <div>
                  <span className="exc-info-label">الكلية والاختصاص</span>
                  <div className="exc-info-value" style={{ fontSize: '14px' }}>{ticket.college}</div>
                  <span className="exc-info-sub">{ticket.department}</span>
                </div>

                <div>
                  <span className="exc-info-label">نوع التذكرة والمقاعد</span>
                  <span className="exc-ticket-chip">
                    <span className="exc-symbol">confirmation_number</span>
                    <span>{ticket.ticketType}</span>
                  </span>
                  <div className="exc-info-sub">{ticket.seats}</div>
                  <span className={`exc-pay-chip ${ticket.payment}`} style={{ marginTop: '6px' }}>
                    {ticket.payment === 'confirmed' ? 'الدفع مؤكد' : 'الدفع قيد المعالجة'}
                  </span>
                </div>
              </div>

              {ticket.scanned ? (
                <div className="exc-alert">
                  <span className="exc-symbol">info</span>
                  <p style={{ margin: 0 }}>
                    <strong>تنبيه أمني إداري:</strong> تم مسح رمز QR لهذه التذكرة الساعة {ticket.scanTime}. أي إجراء أدناه بيتسجل تلقائياً بالسجل الرقابي الموحد باسمك.
                  </p>
                </div>
              ) : (
                <div className="exc-alert ok">
                  <span className="exc-symbol">info</span>
                  <p style={{ margin: 0 }}>
                    <strong>التذكرة غير ممسوحة:</strong> بإمكانك تسجيل الدخول يدوياً إذا تعذّر المسح. الإجراء بيتسجل بالسجل الرقابي باسمك.
                  </p>
                </div>
              )}

              <div>
                <h5 className="exc-actions-title">الإجراءات الاستثنائية المتاحة للتذكرة:</h5>
                <div className="exc-actions-grid">
                  <button
                    type="button"
                    className="exc-action-btn primary"
                    onClick={handleManualEntry}
                    disabled={ticket.scanned}
                    title={ticket.scanned ? 'التذكرة ممسوحة مسبقاً' : ''}
                  >
                    <span className="exc-symbol">how_to_reg</span>
                    <span>تسجيل دخول يدوي</span>
                  </button>

                  <button
                    type="button"
                    className="exc-action-btn"
                    onClick={handleCancelScan}
                    disabled={!ticket.scanned}
                    title={!ticket.scanned ? 'ما في مسح لإلغائه' : ''}
                  >
                    <span className="exc-symbol">restart_alt</span>
                    <span>إلغاء مسح خاطئ</span>
                  </button>

                  <button
                    type="button"
                    className="exc-action-btn warn"
                    onClick={handleReturnPending}
                    disabled={ticket.payment === 'pending'}
                  >
                    <span className="exc-symbol">pending</span>
                    <span>إرجاع الدفع لقيد المعالجة</span>
                  </button>

                  <button
                    type="button"
                    className="exc-action-btn"
                    onClick={() => {
                      setEmailDraft(ticket.email);
                      setEditingEmail((v) => !v);
                    }}
                  >
                    <span className="exc-symbol">mark_email_read</span>
                    <span>تعديل البريد</span>
                  </button>
                </div>

                {editingEmail && (
                  <form className="exc-email-form" onSubmit={handleSaveEmail}>
                    <input
                      type="email"
                      dir="ltr"
                      className="exc-input"
                      aria-label="البريد الإلكتروني الجديد"
                      placeholder="name@baath-edu.sy"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      required
                    />
                    <div className="exc-email-actions">
                      <button type="submit" className="exc-btn-small solid">حفظ البريد</button>
                      <button type="button" className="exc-btn-small" onClick={() => setEditingEmail(false)}>
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>
        )}

        {/* سجل التدقيق */}
        <section className="exc-card flush">
          <div className="exc-log-head">
            <div>
              <div className="exc-log-title">
                <span className="exc-symbol" style={{ color: '#124d44', fontSize: '24px' }}>history_toggle_off</span>
                <h4 className="exc-card-title">سجل التدقيق الرقابي (Audit Log)</h4>
              </div>
              <p className="exc-card-sub">سجل لجميع العمليات الطارئة المنفّذة من مشرفي اتحاد الطلبة بحمص.</p>
            </div>

            <div className="exc-log-tools">
              <button type="button" className="exc-tool-btn">
                <span className="exc-symbol" style={{ fontSize: '16px' }}>filter_list</span>
                <span>تصفية السجل</span>
              </button>
              <button type="button" className="exc-tool-btn">
                <span className="exc-symbol" style={{ fontSize: '16px' }}>download</span>
                <span>تصدير PDF</span>
              </button>
            </div>
          </div>

          <div className="exc-table-wrapper">
            <table className="exc-table">
              <thead>
                <tr>
                  <th>المنفِّذ</th>
                  <th>الإجراء المتخذ</th>
                  <th>المستفيد / التذكرة</th>
                  <th>الوقت والتاريخ</th>
                  <th style={{ textAlign: 'center' }}>حالة العملية</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr key={`${log.ticketId}-${log.time}-${index}`}>
                    <td className="exc-td-exec">
                      <div className="exc-exec-cell">
                        <div className="exc-exec-avatar">{initialsOf(log.executorName)}</div>
                        <div>
                          <div className="exc-cell-main">{log.executorName}</div>
                          <div className="exc-cell-sub">{log.executorRole}</div>
                        </div>
                      </div>
                    </td>

                    <td data-label="الإجراء المتخذ">
                      <div className="exc-action-name">
                        <span className="exc-action-dot"></span>
                        <span className="exc-cell-main">{log.actionName}</span>
                      </div>
                      <div className="exc-cell-sub">{log.actionDesc}</div>
                    </td>

                    <td data-label="المستفيد / التذكرة">
                      <div className="exc-cell-main">{log.beneficiaryName}</div>
                      <div className="exc-cell-sub num">{log.ticketId}</div>
                    </td>

                    <td data-label="الوقت والتاريخ">
                      <span className="exc-cell-sub" style={{ fontSize: '12px', color: '#201b0f' }}>{log.time}</span>
                    </td>

                    <td data-label="حالة العملية" style={{ textAlign: 'center' }}>
                      <span className="exc-status-chip">
                        <span className="exc-symbol">check</span>
                        <span>موثقة بالنظام</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="exc-log-footer">عرض {logs.length} عملية استثنائية مسجلة</div>
        </section>

        <p className="exc-footer-note">
          الاتحاد الوطني لطلبة سورية — فرع جامعة حمص • منظومة إدارة فعاليات التخرج المركزية
        </p>
      </main>
    </div>
  );
}