import { useState } from 'react';
import { useDb } from '../store';
import { addDays, iso, MONTHS, parse, range, today } from '../dates';
import { dayStatus, entriesFor, fmtMins, isDateLocked, sumMinutes, type DayStatus } from '../logic';
import { useNow } from '../ui';

const LABEL: Partial<Record<DayStatus, string>> = {
  logged: 'Logged',
  missing: 'Missing',
  leave: 'Leave',
  'today-empty': 'Today',
};

/** Screen E5 — month grid marking each day logged / missing / leave / locked. */
export function Calendar({ employeeId, onOpenDay }: { employeeId: number; onOpenDay: (d: string) => void }) {
  const db = useDb();
  const now = useNow();
  const t = today();
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const [month, setMonth] = useState(t.slice(0, 7)); // YYYY-MM

  const first = `${month}-01`;
  const d0 = parse(first);
  const last = iso(new Date(d0.getFullYear(), d0.getMonth() + 1, 0));
  const lead = (d0.getDay() + 6) % 7; // Monday-first grid
  const gridStart = addDays(first, -lead);
  const trail = 6 - ((parse(last).getDay() + 6) % 7);
  const cells = range(gridStart, addDays(last, trail));
  const canPrev = month > emp.joinDate.slice(0, 7);

  const shift = (n: number) => {
    const d = new Date(d0.getFullYear(), d0.getMonth() + n, 1);
    setMonth(iso(d).slice(0, 7));
  };

  const monthEntries = db.workEntries.filter((e) => e.employeeId === employeeId && e.entryDate >= first && e.entryDate <= last);
  const monthTotal = sumMinutes(monthEntries);
  const counts = { logged: 0, missing: 0, leave: 0 };
  for (const d of range(first, last)) {
    const s = dayStatus(db, emp, d);
    if (s === 'logged' || s === 'missing' || s === 'leave') counts[s]++;
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>{MONTHS[d0.getMonth()]} {d0.getFullYear()}</h1>
        </div>
        <div className="week-nav">
          <button className="icon-btn" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
          <button className="btn btn-quiet btn-sm" onClick={() => setMonth(t.slice(0, 7))} disabled={month === t.slice(0, 7)}>Today</button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
        </div>
      </header>

      <div className="week-meta">
        <span className="mono"><b>{fmtMins(monthTotal)}</b> logged</span>
        <span className="muted">{counts.logged} {counts.logged === 1 ? 'day' : 'days'} logged · {counts.leave} leave · {counts.missing} missing</span>
      </div>

      <div className="cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const status = dayStatus(db, emp, d);
          const mins = sumMinutes(entriesFor(db, employeeId, d));
          const locked = d <= t && isDateLocked(db, d, now) && status !== 'before-join';
          const clickable = status !== 'before-join';
          return (
            <button
              key={d}
              className={`cal-cell st-${status} ${inMonth ? '' : 'out'} ${d === t ? 'is-today' : ''}`}
              disabled={!clickable}
              onClick={() => onOpenDay(d)}
              aria-label={`${d} ${LABEL[status] ?? ''} ${locked ? 'locked' : ''}`}
            >
              <span className="cal-num">{Number(d.slice(8))}</span>
              {locked && <i className="lock-ic" />}
              {mins > 0 && <span className="cal-hrs mono">{fmtMins(mins)}</span>}
              {inMonth && status === 'leave' && <span className="cal-tag">Leave</span>}
              {inMonth && status === 'missing' && <span className="cal-tag">Missing</span>}
            </button>
          );
        })}
      </div>

      <div className="legend">
        <span><i className="sw sw-logged" />Logged</span>
        <span><i className="sw sw-missing" />Missing</span>
        <span><i className="sw sw-leave" />Leave</span>
        <span><i className="lock-ic" />Locked</span>
      </div>
      <p className="fine">Weekends and future days are never marked missing. A day with approved leave always shows as Leave.</p>
    </div>
  );
}
