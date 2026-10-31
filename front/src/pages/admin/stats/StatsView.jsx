import React, { useState } from 'react';
import InfoTip from './InfoTip.jsx';
import { STATS_HELP, ALL_EVENTS_NOTE } from '../../../config/statsHelp.js';
import { companionsLabel } from '../../../utils/companions';
import {
  fmt,
  pct,
  money,
  statusSegments,
  statusTotal,
  ageLabel,
  closeIn,
  collegeRate,
  rateTone,
  sortColleges,
  drillSection,
  drillFilters,
} from '../../../utils/stats.js';

const clock = (iso) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Damascus',
      }).format(new Date(iso))
    : '';

function Num({ value, onClick, className = '' }) {
  return (
    <button type="button" className={`st2-link ${className}`.trim()} onClick={onClick}>
      {value}
    </button>
  );
}

// A pill with a number and a sentence; the whole text opens the matching list.
function Chip({ tone = '', help, onClick, children }) {
  return (
    <span className={`st2-chip ${tone}`.trim()}>
      <button type="button" className="st2-link" onClick={onClick}>
        {children}
      </button>
      <InfoTip text={help} />
    </span>
  );
}

function Bar({ segments }) {
  return (
    <div className="st2-stack" role="img" aria-label="توزيع الخريجين المسجلين حسب حالة التذكرة">
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span key={s.key} style={{ width: `${s.share}%`, background: s.color }} title={`${s.label}: ${fmt(s.count)}`} />
        ))}
    </div>
  );
}

function Legend({ segments, go }) {
  return (
    <ul className="st2-legend">
      {segments.map((s) => (
        <li key={s.key}>
          <span className="st2-dot" style={{ background: s.color }} />
          <span>{s.label}</span>
          <Num value={fmt(s.count)} onClick={() => go(s.key)} className="st2-strong" />
        </li>
      ))}
    </ul>
  );
}

export default function StatsView({ data, onGo }) {
  const [sort, setSort] = useState('lowest');
  const [showAllColleges, setShowAllColleges] = useState(false);

  const eventId = data.scope.event_id;
  const all = eventId === null;
  const go = (kind, extra) => onGo(drillSection({ ...drillFilters(kind, eventId), ...extra }));
  const goEvent = (id, extra) => onGo(drillSection({ event_id: id, ...extra }));

  const { attention, attendance, entry, finance, top_students: top, representation: rep, footer } = data;
  const colleges = sortColleges(data.colleges, sort);
  const visibleColleges = showAllColleges ? colleges : colleges.slice(0, 6);
  const closing = closeIn(footer.registration, data.generated_at);
  const entryExpected = entry.expected;

  return (
    <>
      {all && (
        <div className="st2-note" role="note">
          {ALL_EVENTS_NOTE}
        </div>
      )}

      {/* الدخول: بارز دائماً، ويتبع الفلتر العلوي */}
      <section className="st2-card st2-entry" aria-label="الدخول">
        <div className="st2-head">
          <h4>
            الدخول {all ? '(كل الحفلات)' : '(الحفل المحدد)'}
            <InfoTip text={STATS_HELP.entry} />
          </h4>
          <span className="st2-muted">
            {entry.entered > 0 ? `آخر دخول ${clock(entry.last_entry_at)}` : 'لم يبدأ المسح بعد'}
          </span>
        </div>
        <div className="st2-entry-main">
          <Num value={fmt(entry.entered)} onClick={() => go('entered')} className="st2-big" />
          <span className="st2-muted">
            دخلوا من أصل {fmt(entryExpected)} · خريجون {fmt(entry.graduates_entered)} · مرافقون{' '}
            {fmt(entry.companions_entered)}
            {entry.manual > 0 ? ` · منهم دخول يدوي ${fmt(entry.manual)}` : ''}
          </span>
        </div>
        <div className="st2-progress" aria-hidden="true">
          <span style={{ width: `${pct(entry.entered, entryExpected)}%` }} />
        </div>
        {all && data.by_event.length > 1 && (
          <ul className="st2-rows">
            {data.by_event.map((e) => (
              <li key={e.event_id}>
                <span>{e.event_name}</span>
                <span className="st2-muted">
                  {fmt(e.entry.entered)} من {fmt(e.entry.expected)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="st2-two">
        <div className="st2-col">
          <section className="st2-card" aria-label="حالة الخريجين المسجلين">
            <div className="st2-head">
              <h4>
                حالة الخريجين المسجلين
                <InfoTip text={STATS_HELP.status} />
              </h4>
            </div>
            {data.by_event.length === 0 && <p className="st2-muted">لا توجد بيانات بعد.</p>}
            {data.by_event.map((e) => {
              const seg = statusSegments(e.status);
              return (
                <div key={e.event_id} className="st2-status-block">
                  {all && (
                    <div className="st2-status-title">
                      <span>{e.event_name}</span>
                      <span className="st2-muted">{fmt(statusTotal(e.status))} مسجّل</span>
                    </div>
                  )}
                  <Bar segments={seg} />
                  <Legend segments={seg} go={(kind) => goEvent(e.event_id, drillFilters(kind, null))} />
                </div>
              );
            })}
          </section>

          <section className="st2-strip" aria-label="أرقام تحتاج متابعة">
            <Chip tone={attention.processing > 0 ? 'warn' : ''} help={STATS_HELP.processing} onClick={() => go('processing')}>
              <b>{fmt(attention.processing)}</b> طلب دفع بانتظار المراجعة
              {attention.oldest_pending_hours !== null && ` · أقدمها منذ ${ageLabel(attention.oldest_pending_hours)}`}
            </Chip>
            <Chip tone={attention.rejected > 0 ? 'bad' : ''} help={STATS_HELP.rejected} onClick={() => go('rejected')}>
              <b>{fmt(attention.rejected)}</b> مرفوضة
            </Chip>
            <Chip help={STATS_HELP.unverified} onClick={() => go('unverified')}>
              <b>{fmt(attention.unverified)}</b> بانتظار تأكيد البريد
            </Chip>
            <Chip tone="good" help={STATS_HELP.confirmed} onClick={() => go('confirmed')}>
              <b>{fmt(attention.confirmed)}</b> طلب تم تأكيده
            </Chip>
          </section>
        </div>

        <section className="st2-card st2-attend" aria-label="الحضور المتوقع">
          <h4>
            الحضور المتوقع
            <InfoTip text={STATS_HELP.attendance} />
          </h4>
          <div>
            <Num value={fmt(attendance.expected)} onClick={() => go('confirmed')} className="st2-big" />
            <span className="st2-unit"> شخصاً</span>
          </div>
          <div className="st2-muted">
            {fmt(attendance.graduates)} من الخريجين
            <br />
            {fmt(attendance.companions)} مرافقاً
            <br />
            <small>تذاكر مؤكدة فقط{all ? ' · الخريج بحفلين = حضوران' : ''}</small>
          </div>
        </section>
      </div>

      <div className="st2-three">
        <section className="st2-mini" aria-label="المالية">
          <div className="st2-muted">
            المالية (مؤكدة)
            <InfoTip text={STATS_HELP.finance} />
          </div>
          <Num value={money(finance.confirmed_amount)} onClick={() => go('confirmed')} className="st2-mid" />
          <div className="st2-muted st2-small">قيد المراجعة {money(finance.processing_amount)}</div>
          {finance.by_package.length > 0 && (
            <div className="st2-muted st2-small">
              {finance.by_package.map((p) => `${companionsLabel(p.companions_count)}: ${fmt(p.tickets)}`).join(' · ')}
            </div>
          )}
        </section>

        <section className="st2-mini" aria-label="الأوائل">
          <div className="st2-muted">
            الأوائل
            <InfoTip text={STATS_HELP.top} />
          </div>
          <div>
            <Num value={fmt(top.registered)} onClick={() => go('top')} className="st2-mid" />
            <span className="st2-unit"> من {fmt(top.total)} سجّلوا</span>
          </div>
          <div className="st2-muted st2-small">{fmt(top.confirmed)} منهم تذاكرهم مؤكدة</div>
        </section>

        <section className="st2-mini" aria-label="تمثيل الدفعة">
          <div className="st2-muted">
            تمثيل الدفعة
            <InfoTip text={STATS_HELP.representation} />
          </div>
          <div>
            <span className="st2-mid">{fmt(rep.wants)}</span>
            <span className="st2-unit"> راغباً</span>
          </div>
          <div className="st2-muted st2-small">
            {fmt(rep.experienced)} بخبرة · {fmt(rep.both)} الأنسب · من {fmt(rep.answered)} أجابوا
          </div>
        </section>
      </div>

      <section className="st2-card" aria-label="حسب الكلية">
        <div className="st2-head">
          <h4>
            حسب الكلية
            <InfoTip text={STATS_HELP.colleges} />
          </h4>
          <label className="st2-sort">
            <span className="st2-muted">الترتيب</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="ترتيب الكليات">
              <option value="lowest">الأقل تأكيداً أولاً</option>
              <option value="highest">الأكثر تأكيداً أولاً</option>
              <option value="name">حسب الاسم</option>
            </select>
          </label>
        </div>
        {colleges.length === 0 ? (
          <p className="st2-muted">لا توجد بيانات كليات لعرضها.</p>
        ) : (
          <div className="st2-table-wrap">
            <table className="st2-table">
              <thead>
                <tr>
                  <th>الكلية</th>
                  <th>متوقع</th>
                  <th>سجّلوا</th>
                  <th>مؤكد</th>
                  <th>نسبة التأكيد</th>
                </tr>
              </thead>
              <tbody>
                {visibleColleges.map((c) => {
                  const rate = collegeRate(c);
                  return (
                    <tr key={c.college_id}>
                      <td>
                        <Num
                          value={c.name}
                          onClick={() => go('all', { college_id: c.college_id })}
                        />
                      </td>
                      <td>{fmt(c.expected)}</td>
                      <td>{fmt(c.registered)}</td>
                      <td>{fmt(c.confirmed)}</td>
                      <td>
                        <div className="st2-rate">
                          <span className="st2-rate-track">
                            <span className={`st2-rate-fill ${rateTone(rate)}`} style={{ width: `${rate}%` }} />
                          </span>
                          <span>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {colleges.length > 6 && (
          <button type="button" className="st2-more" onClick={() => setShowAllColleges((v) => !v)}>
            {showAllColleges ? 'عرض أقل' : `عرض الكل (${colleges.length})`}
          </button>
        )}
      </section>

      <div className="st2-three">
        <section className="st2-mini" aria-label="الحسابات المؤكدة">
          <div className="st2-muted">
            الحسابات المؤكدة
            <InfoTip text={STATS_HELP.confirmed_accounts} />
          </div>
          <div>
            <Num value={fmt(footer.confirmed_accounts)} onClick={() => go('registered')} className="st2-mid" />
            <span className="st2-unit"> حساباً</span>
          </div>
          <div className="st2-muted st2-small">منذ بداية التسجيل{all ? ' · أشخاص مختلفون' : ''}</div>
        </section>

        <section className="st2-mini" aria-label="إغلاق التسجيل">
          <div className="st2-muted">
            {all ? 'أقرب إغلاق للتسجيل' : 'إغلاق التسجيل'}
            <InfoTip text={STATS_HELP.registration} />
          </div>
          <div>
            <span className="st2-mid">{closing.closed ? 'مغلق' : fmt(closing.value)}</span>
            {!closing.closed && <span className="st2-unit"> {closing.unit}</span>}
          </div>
          <div className="st2-muted st2-small">
            {footer.registration ? footer.registration.event_name : 'لا يوجد تسجيل مفتوح'}
          </div>
        </section>

        <section className="st2-mini" aria-label="متوسط وقت المراجعة">
          <div className="st2-muted">
            متوسط وقت المراجعة
            <InfoTip text={STATS_HELP.review} />
          </div>
          <div>
            <span className="st2-mid">{footer.avg_review_hours === null ? '—' : fmt(footer.avg_review_hours)}</span>
            {footer.avg_review_hours !== null && <span className="st2-unit"> ساعات</span>}
          </div>
          <div className="st2-muted st2-small">
            {footer.reviewed_count > 0 ? `آخر 7 أيام · ${fmt(footer.reviewed_count)} دفعة` : 'لا توجد دفعات رُوجعت مؤخراً'}
          </div>
        </section>
      </div>
    </>
  );
}
