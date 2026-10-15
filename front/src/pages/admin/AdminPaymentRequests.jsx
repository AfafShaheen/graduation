import React, { useState, useEffect, useMemo } from 'react';
import '../../style/AdminPaymentRequests.css';
import AdminSidebar from '../../components/AdminSidebar';

/* ==========================================================================
   بيانات تجريبية: لما يجهز الباك إند بدّلها ببيانات حقيقية (عبر props)
   ========================================================================== */
const REQUESTS = [
  {
    id: '2019-10842',
    name: 'سامر إبراهيم النجار',
    college: 'كلية الهندسة المدنية — هندسة الإنشاءات',
    ceremony: 'eng',
    status: 'pending',
    guests: 2,
    required: 125000,
    paid: 125000,
    txRef: '#SC-9821408',
    senderName: 'سامر إبراهيم النجار',
  },
  {
    id: '2020-04312',
    name: 'ريتا يوسف الخوري',
    college: 'كلية الهندسة الميكانيكية والكهربائية — هندسة حواسيب',
    ceremony: 'eng',
    status: 'pending',
    guests: 2,
    required: 125000,
    paid: 100000,
    txRef: '#SC-7731920',
    senderName: 'يوسف الياس الخوري',
  },
  {
    id: '2019-33104',
    name: 'عمر خالد السباعي',
    college: 'كلية الهندسة الكيميائية والبترولية',
    ceremony: 'eng',
    status: 'pending',
    guests: 3,
    required: 160000,
    paid: 160000,
    txRef: '#SC-4490123',
    senderName: 'خالد عبد القادر السباعي',
  },
  {
    id: '2020-08991',
    name: 'ميساء طارق الرفاعي',
    college: 'كلية الهندسة المعمارية — تصميم داخلي',
    ceremony: 'eng',
    status: 'pending',
    guests: 2,
    required: 125000,
    paid: 125000,
    txRef: '#SC-1102948',
    senderName: 'ميساء طارق الرفاعي',
  },
  {
    id: '2019-12401',
    name: 'زين الدين أحمد حسون',
    college: 'كلية الهندسة المدنية — إدارة التشييد',
    ceremony: 'eng',
    status: 'pending',
    guests: 3,
    required: 160000,
    paid: 160000,
    txRef: '#SC-6582103',
    senderName: 'أحمد حسون (الوالد)',
  },
];

const CEREMONY_OPTIONS = [
  { value: 'all', label: 'كل الحفلات' },
  { value: 'eng', label: 'حفل كليات الهندسة الدفعة 44' },
  { value: 'med', label: 'حفل كلية الطب البشري الدفعة 41' },
  { value: 'sci', label: 'حفل كلية العلوم الدفعة 45' },
];

const fmt = (n) => n.toLocaleString('en-US');

export default function AdminPaymentRequests({
  adminName = 'مسؤول الاتحاد',
  adminRole = 'الاتحاد الوطني لطلبة سورية',
  requests = REQUESTS,
  onConfirmPayment,
  onRejectPayment,
  onAddTicket,
  onNavigate,
  onLogout,
}) {
  const [items, setItems] = useState(requests);
  const [searchQuery, setSearchQuery] = useState('');
  const [ceremonyFilter, setCeremonyFilter] = useState('eng');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [navOpen, setNavOpen] = useState(false); // القائمة الجانبية على الشاشات الصغيرة

  // مزامنة القائمة لما تتغير البيانات القادمة من الباك إند
  useEffect(() => {
    setItems(requests);
  }, [requests]);

  // إغلاق القائمة بزر Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const mismatchCount = items.filter((i) => i.status === 'pending' && i.paid !== i.required).length;
  const confirmedItems = items.filter((i) => i.status === 'confirmed');
  const confirmedTotal = confirmedItems.reduce((sum, i) => sum + i.paid, 0);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((i) => {
      if (ceremonyFilter !== 'all' && i.ceremony !== ceremonyFilter) return false;
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!q) return true;
      return [i.name, i.id, i.txRef, i.senderName].join(' ').toLowerCase().includes(q);
    });
  }, [items, searchQuery, ceremonyFilter, statusFilter]);

  const setStatus = (txRef, status) =>
    setItems((prev) => prev.map((i) => (i.txRef === txRef ? { ...i, status } : i)));

  const handleConfirm = (item) => {
    setStatus(item.txRef, 'confirmed');
    if (onConfirmPayment) onConfirmPayment(item.name, item.txRef);
  };

  const handleReject = (item) => {
    setStatus(item.txRef, 'rejected');
    if (onRejectPayment) onRejectPayment(item.name, item.id, item.txRef);
  };

  return (
    <div className="pay-req-app-container">
      <div className="pay-req-top-accent"></div>

      {/* الشريط الجانبي (كومبوننت مشترك) */}
      <AdminSidebar
        activeId="payments"
        onAddTicket={onAddTicket}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        adminRole={adminRole}
      />

      {/* الشريط العلوي */}
      <header className="pay-req-topbar">
        <button
          type="button"
          className="pay-req-menu-btn"
          aria-label="فتح القائمة"
          onClick={() => setNavOpen(true)}
        >
          <span className="pay-req-symbol" style={{ fontSize: '24px' }}>menu</span>
        </button>

        <div className="pay-req-topbar-title">
          <h2>طلبات الدفع</h2>
          <div className="pay-req-topbar-sub">
            <span className="pay-req-live-dot"></span>
            <span>تدقيق الدفع المباشر (شام كاش)</span>
            <span>•</span>
            <span>جامعة حمص</span>
          </div>
        </div>

        <div className="pay-req-topbar-actions">
          <button aria-label="التنبيهات" className="pay-req-icon-btn" title="التنبيهات" type="button">
            <span className="pay-req-symbol">notifications</span>
            <span className="pay-req-notif-dot"></span>
          </button>

          <button aria-label="التقويم" className="pay-req-icon-btn" title="التقويم" type="button">
            <span className="pay-req-symbol">calendar_today</span>
          </button>

          <button className="pay-req-help-btn" type="button">
            <span className="pay-req-symbol" style={{ fontSize: '18px' }}>help_outline</span>
            <span className="pay-req-help-text">المساعدة والدعم</span>
          </button>
        </div>
      </header>

      {/* المحتوى */}
      <main className="pay-req-main-canvas">
        <section className="pay-req-hero-titles">
          <div className="pay-req-pulse-tag">
            <span className="pay-req-mini-dot"></span>
            <span className="pay-req-pulse-label">طلبات الدفع</span>
            <span className="pay-req-pulse-venue">• بانتظار التدقيق: {pendingCount}</span>
          </div>
          <h3>تدقيق ومطابقة إشعارات شام كاش</h3>
          <p>قارن المبلغ المُدخل بالسعر المطلوب واسم المرسل، ثم أكّد الدفع لإصدار التذكرة أو ارفضه مع إشعار الطالب.</p>
        </section>

        {/* الإحصائيات */}
        <section className="pay-req-stats-grid">
          <div className="pay-req-stat-card">
            <div>
              <p className="pay-req-stat-label">إجمالي الطلبات المستلمة</p>
              <p className="pay-req-stat-value">{fmt(items.length)}</p>
              <p className="pay-req-stat-note">
                <span className="pay-req-symbol" style={{ fontSize: '16px' }}>trending_up</span>
                جميع الحفلات المعروضة
              </p>
            </div>
            <div className="pay-req-stat-icon">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>receipt</span>
            </div>
          </div>

          <div className="pay-req-stat-card orange">
            <div>
              <p className="pay-req-stat-label orange">قيد التدقيق والمعالجة</p>
              <p className="pay-req-stat-value orange">{fmt(pendingCount)}</p>
              <p className="pay-req-stat-note orange">تتطلب مراجعة إشعار شام كاش</p>
            </div>
            <div className="pay-req-stat-icon orange">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>pending_actions</span>
            </div>
          </div>

          <div className="pay-req-stat-card">
            <div>
              <p className="pay-req-stat-label">حالات عدم تطابق المبلغ</p>
              <p className="pay-req-stat-value orange">{fmt(mismatchCount)}</p>
              <p className="pay-req-stat-note">تفاوت بين السعر والإشعار</p>
            </div>
            <div className="pay-req-stat-icon orange">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>warning</span>
            </div>
          </div>

          <div className="pay-req-stat-card">
            <div>
              <p className="pay-req-stat-label">المبالغ المؤكدة للاتحاد</p>
              <p className="pay-req-stat-value small">
                {fmt(confirmedTotal)} <span className="pay-req-stat-unit">ل.س</span>
              </p>
              <p className="pay-req-stat-note">{fmt(confirmedItems.length)} خريج مسدد بنجاح</p>
            </div>
            <div className="pay-req-stat-icon">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>account_balance_wallet</span>
            </div>
          </div>
        </section>

        {/* الفلاتر والبحث */}
        <section className="pay-req-filter-bar">
          <div className="pay-req-search-box">
            <input
              type="text"
              autoComplete="off"
              className="pay-req-search-input"
              placeholder="ابحث بالاسم، الرقم الجامعي، أو رقم الإشعار..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="pay-req-symbol pay-req-search-icon" style={{ fontSize: '18px' }}>search</span>
          </div>

          <div className="pay-req-filter-selects">
            <div className="pay-req-select-wrapper">
              <span className="pay-req-select-label">الحفل:</span>
              <select
                aria-label="تصفية حسب الحفل"
                value={ceremonyFilter}
                onChange={(e) => setCeremonyFilter(e.target.value)}
              >
                {CEREMONY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="pay-req-select-wrapper">
              <span className="pay-req-select-label">الحالة:</span>
              <select
                aria-label="تصفية حسب الحالة"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">الكل</option>
                <option value="pending">قيد المعالجة ({pendingCount})</option>
                <option value="confirmed">مؤكدة</option>
                <option value="rejected">مرفوضة</option>
              </select>
            </div>
          </div>
        </section>

        {/* الجدول */}
        <div className="pay-req-table-card">
          <div className="pay-req-table-header">
            <div className="pay-req-table-title">
              <span className="pay-req-symbol" style={{ fontSize: '24px' }}>receipt_long</span>
              <div>
                <h4>جدول تدقيق ومطابقة طلبات الدفع</h4>
                <p>حفل كليات الهندسة — الدفعة 44</p>
              </div>
            </div>
            <div className="pay-req-table-tools">
              <button type="button" className="pay-req-tool-btn">
                <span className="pay-req-symbol" style={{ fontSize: '16px' }}>table_chart</span>
                <span>تصدير إكسل</span>
              </button>
              <button type="button" className="pay-req-tool-btn" onClick={() => setItems(requests)}>
                <span className="pay-req-symbol" style={{ fontSize: '16px' }}>refresh</span>
                <span>تحديث</span>
              </button>
            </div>
          </div>

          <div className="pay-req-table-wrapper">
            <table className="pay-req-table">
              <thead>
                <tr>
                  <th>الخريج</th>
                  <th>الرقم الجامعي</th>
                  <th>نوع التذكرة</th>
                  <th>السعر المطلوب</th>
                  <th>رقم العملية</th>
                  <th>المبلغ المُدخل</th>
                  <th>اسم المرسل</th>
                  <th style={{ textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const mismatch = item.paid !== item.required;
                  const diff = item.required - item.paid;
                  const pending = item.status === 'pending';

                  return (
                    <tr key={item.txRef} className={mismatch && pending ? 'row-mismatch' : ''}>
                      <td className="pay-req-td-name">
                        <div className="pay-req-person-name">{item.name}</div>
                        <div className="pay-req-person-sub">{item.college}</div>
                      </td>

                      <td data-label="الرقم الجامعي">
                        <span className="pay-req-num">{item.id}</span>
                      </td>

                      <td data-label="نوع التذكرة">
                        <span className={`pay-req-ticket-chip ${item.guests === 3 ? 'group' : ''}`}>
                          <span className="pay-req-symbol">
                            {item.guests === 3 ? 'group_add' : 'confirmation_number'}
                          </span>
                          <span>خريج + {item.guests} مرافقين</span>
                        </span>
                      </td>

                      <td data-label="السعر المطلوب">
                        <span className="pay-req-amount">
                          {fmt(item.required)} <span className="pay-req-unit">ل.س</span>
                        </span>
                      </td>

                      <td data-label="رقم العملية">
                        <span className={`pay-req-txref ${mismatch ? 'mismatch' : ''}`}>{item.txRef}</span>
                      </td>

                      <td data-label="المبلغ المُدخل">
                        <div className={`pay-req-amount ${mismatch ? 'bad' : 'ok'}`}>
                          {fmt(item.paid)} <span className="pay-req-unit">ل.س</span>
                        </div>
                        {mismatch ? (
                          <span className="pay-req-mismatch-chip">
                            <span className="pay-req-symbol">error</span>
                            <span>
                              عدم تطابق ({diff > 0 ? 'نقص' : 'زيادة'} {fmt(Math.abs(diff))})
                            </span>
                          </span>
                        ) : (
                          <div className="pay-req-match">
                            <span className="pay-req-symbol">check_circle</span>
                            <span>مطابق تماماً</span>
                          </div>
                        )}
                      </td>

                      <td data-label="اسم المرسل">
                        <div className="pay-req-sender-name">{item.senderName}</div>
                      </td>

                      <td className="pay-req-td-actions">
                        {pending ? (
                          <div className="pay-req-actions-cell">
                            <button
                              type="button"
                              className="pay-req-btn-confirm"
                              onClick={() => handleConfirm(item)}
                              title="تأكيد الدفع وإصدار باركود التذكرة"
                            >
                              <span className="pay-req-symbol">check</span>
                              <span>تأكيد</span>
                            </button>
                            <button
                              type="button"
                              className={`pay-req-btn-reject ${mismatch ? 'warn' : ''}`}
                              onClick={() => handleReject(item)}
                              title="رفض الطلب وإبلاغ الطالب"
                            >
                              <span className="pay-req-symbol">block</span>
                              <span>رفض</span>
                            </button>
                          </div>
                        ) : (
                          <div className="pay-req-actions-cell" style={{ justifyContent: 'center' }}>
                            <span className="pay-req-ticket-chip">
                              {item.status === 'confirmed' ? 'تم التأكيد' : 'تم الرفض'}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && <div className="pay-req-empty">ما في طلبات مطابقة</div>}

          <div className="pay-req-table-footer">
            <div>
              عرض {filtered.length} من أصل {items.length} طلباً
              {mismatchCount > 0 && (
                <>
                  {' | '}
                  <strong>{mismatchCount} حالة عدم تطابق تحتاج إجراء فوري</strong>
                </>
              )}
            </div>
            <div className="pay-req-pager">
              <button type="button" className="pay-req-page-btn active">1</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}