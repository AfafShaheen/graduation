import React, { useState } from 'react';
import InfoTip from './InfoTip.jsx';
import { STATS_HELP, ALL_EVENTS_NOTE } from '../../../config/statsHelp.js';
import { companionsLabel } from '../../../utils/companions';
import {
  fmt,
  pct,
  funnelSteps,
  sparkline,
  hourLabel,
  dayLabel,
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

  const { attention, attendance, entry, top_students: top, representation: rep, footer } = data;
  const steps = funnelSteps(data.funnel);
  const spark = sparkline(data.timeline);
  const hourMax = Math.max(1, ...data.arrivals.by_hour.map((h) => h.count));
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

      {/* الأرقام الأهم: أربع بطاقات ملوّنة تتبع الفلتر العلوي */}
      <div className="st2-hero">
        <section className="st2-tile green" aria-label="تذاكر مؤكدة">
          <div className="st2-tile-label">
            تذاكر مؤكدة
            <InfoTip text={STATS_HELP.confirmed} />
          </div>
          <Num value={fmt(attention.confirmed)} onClick={() => go('confirmed')} className="st2-tile-num" />
          <div className="st2-tile-sub">من {fmt(footer.confirmed_accounts)} حساباً مؤكداً</div>
        </section>

        <section className={`st2-tile ${attention.processing > 0 ? 'orange' : 'calm'}`} aria-label="بانتظار مراجعتك">
          <div className="st2-tile-label">
            بانتظار مراجعتك
            <InfoTip text={STATS_HELP.processing} />
          </div>
          <Num value={fmt(attention.processing)} onClick={() => go('processing')} className="st2-tile-num" />
          <div className="st2-tile-sub">
            {attention.processing > 0 && attention.oldest_pending_hours !== null
              ? `أقدمها منذ ${ageLabel(attention.oldest_pending_hours)}`
              : 'لا طلبات معلّقة'}
          </div>
        </section>

        <section className="st2-tile mint" aria-label="الحضور المتوقع">
          <div className="st2-tile-label">
            الحضور المتوقع
            <InfoTip text={STATS_HELP.attendance} />
          </div>
          <Num value={fmt(attendance.expected)} onClick={() => go('confirmed')} className="st2-tile-num" />
          <div className="st2-tile-sub">
            {fmt(attendance.graduates)} من الخريجين · {fmt(attendance.companions)} مرافقاً
            {all ? ' · الخريج بحفلين = حضوران' : ''}
          </div>
        </section>

        <section className="st2-tile sand" aria-label="الدخول">
          <div className="st2-tile-label">
            {all ? 'الدخول (كل الحفلات)' : 'الدخول'}
            <InfoTip text={STATS_HELP.entry} />
          </div>
          <Num value={`${fmt(entry.entered)} من ${fmt(entryExpected)}`} onClick={() => go('entered')} className="st2-tile-num" />
          <div className="st2-progress" aria-hidden="true">
            <span style={{ width: `${pct(entry.entered, entryExpected)}%` }} />
          </div>
          <div className="st2-tile-sub">
            {entry.entered > 0 ? `آخر دخول ${clock(entry.last_entry_at)}` : 'لم يبدأ المسح بعد'}
            {entry.manual > 0 ? ` · يدوي ${fmt(entry.manual)}` : ''}
          </div>
        </section>
      </div>

      {all && data.by_event.length > 1 && (
        <section className="st2-card" aria-label="الدخول حسب الحفل">
          <div className="st2-head">
            <h4>الدخول حسب الحفل</h4>
          </div>
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
        </section>
      )}

      <div className="st2-two">
        <div className="st2-col">
          <section className="st2-card accent-green" aria-label="حالة الخريجين المسجلين">
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
            <Chip tone={attention.rejected > 0 ? 'bad' : ''} help={STATS_HELP.rejected} onClick={() => go('rejected')}>
              <b>{fmt(attention.rejected)}</b> مرفوضة
            </Chip>
            <Chip help={STATS_HELP.unverified} onClick={() => go('unverified')}>
              <b>{fmt(attention.unverified)}</b> بانتظار تأكيد البريد
            </Chip>
          </section>
        </div>

        <section className="st2-card accent-orange" aria-label="رحلة الخريج">
          <h4>
            رحلة الخريج: أين نخسر؟
            <InfoTip text={STATS_HELP.funnel} />
          </h4>
          <ul className="st2-funnel">
            {steps.map((step) => (
              <li key={step.key}>
                <div className="st2-funnel-line">
                  <span>{step.label}</span>
                  <b>{fmt(step.count)}</b>
                </div>
                <div className="st2-meter" aria-hidden="true">
                  <span style={{ width: `${step.share}%`, background: step.color }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="st2-two even">
        <section className="st2-card accent-green" aria-label="التسجيل اليومي">
          <h4>
            التسجيل خلال آخر 14 يوماً
            <InfoTip text={STATS_HELP.timeline} />
          </h4>
          <svg className="st2-spark" viewBox="0 0 260 80" preserveAspectRatio="none" role="img" aria-label="عدد الحسابات المؤكدة في كل يوم">
            <path d={spark.area} fill="#124d44" fillOpacity="0.12" />
            <path d={spark.line} fill="none" stroke="#124d44" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="st2-spark-axis">
            <span>{dayLabel(data.timeline[0]?.date)}</span>
            <span>{dayLabel(data.timeline[data.timeline.length - 1]?.date)}</span>
          </div>
          <div className="st2-muted st2-small">
            {spark.total > 0
              ? `${fmt(spark.total)} تسجيلاً · أعلى يوم ${dayLabel(spark.peak?.date)} (${fmt(spark.peak?.count)})`
              : 'لا تسجيلات في هذه الفترة'}
          </div>
        </section>

        <section className="st2-card accent-red" aria-label="أسباب الرفض">
          <h4>
            أسباب الرفض الحالية
            <InfoTip text={STATS_HELP.rejections} />
          </h4>
          {data.rejections.length === 0 ? (
            <p className="st2-muted">لا توجد تذاكر مرفوضة حالياً.</p>
          ) : (
            <ul className="st2-reasons">
              {data.rejections.map((r) => (
                <li key={r.reason}>
                  <span>{r.reason}</span>
                  <b>{fmt(r.count)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="st2-three">
        <section className="st2-mini" aria-label="باقات التذاكر">
          <div className="st2-muted">
            باقات التذاكر (مؤكدة)
            <InfoTip text={STATS_HELP.packages} />
          </div>
          {data.packages.length === 0 ? (
            <div className="st2-muted st2-small">لا تذاكر مؤكدة بعد</div>
          ) : (
            <ul className="st2-reasons tight">
              {data.packages.map((p) => (
                <li key={p.companions_count}>
                  <span>{companionsLabel(p.companions_count)}</span>
                  <b>{fmt(p.tickets)}</b>
                </li>
              ))}
            </ul>
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

      <section className="st2-card accent-green" aria-label="حسب الكلية">
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

      {data.arrivals.by_hour.length > 0 && (
        <section className="st2-card accent-orange" aria-label="الوصول يوم الحفل">
          <h4>
            الوصول يوم الحفل
            <InfoTip text={STATS_HELP.arrivals} />
          </h4>
          <div className="st2-hours" role="img" aria-label="عدد الداخلين في كل ساعة">
            {data.arrivals.by_hour.map((h) => (
              <div key={h.hour} className="st2-hour">
                <span className="st2-hour-n">{fmt(h.count)}</span>
                <span className="st2-hour-bar" style={{ height: `${Math.max(6, (h.count / hourMax) * 70)}px` }} />
                <span className="st2-hour-t">{hourLabel(h.hour)}</span>
              </div>
            ))}
          </div>
          <ul className="st2-reasons">
            {data.arrivals.by_scanner.map((sc) => (
              <li key={sc.name || 'manual'}>
                <span>{sc.name || 'دخول يدوي من الإدارة'}</span>
                <b>{fmt(sc.count)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

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
