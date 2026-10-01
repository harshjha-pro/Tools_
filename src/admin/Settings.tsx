import { useState } from 'react';
import { useDb } from '../store';
import { addDays, DAY_LONG, fmtDateTime, fmtTime, fmtWeek, today, toLocalInput, weekStart } from '../dates';
import { effectiveCutoff, extensionFor, isDateLocked, scheduledCutoff, sumMinutes, fmtMins } from '../logic';
import { addLocation, endExtension, extendCutoff, recentWeekStarts, saveCutoff, toggleLocation } from '../actions';
import { Field, Pill, Sheet, toast, useNow } from '../ui';

/** Screen A19 — weekly cutoff, per-week extensions, work locations. */
export function Settings({ adminId }: { adminId: number }) {
  const db = useDb();
  const now = useNow();
  const [day, setDay] = useState(db.orgSettings.weeklyCutoffDay);
  const [time, setTime] = useState(db.orgSettings.weeklyCutoffTime);
  const [extending, setExtending] = useState<string | null>(null);
  const [newLoc, setNewLoc] = useState('');
  const t = today();
  const weeks = [weekStart(t), ...recentWeekStarts(t, 5)];
  const dirty = day !== db.orgSettings.weeklyCutoffDay || time !== db.orgSettings.weeklyCutoffTime;

  return (
    <div className="page page-wide">
      <header className="page-head"><div><p className="eyebrow">Admin</p><h1>Settings</h1></div></header>

      <div className="two-col">
        <section className="card">
          <div className="card-head"><h3>Weekly lock</h3></div>
          <p className="fine">After the cutoff, employees can't edit that week. Admin can always edit, and can reopen a single week.</p>
          <div className="row2">
            <Field label="Cutoff day" htmlFor="st-day">
              <select id="st-day" className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {DAY_LONG.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </Field>
            <Field label="Cutoff time" htmlFor="st-time">
              <input id="st-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <p className="fine">Each Mon–Sun week locks on the first {DAY_LONG[day]} at {fmtTime(time)} after its working days end.</p>
          <button className="btn btn-primary" disabled={!dirty} onClick={() => { saveCutoff(day, time); toast('Weekly cutoff saved'); }}>Save cutoff</button>

          <div className="step-label">Recent weeks</div>
          <table className="table">
            <thead><tr><th>Week</th><th className="num">Logged</th><th>Lock</th><th /></tr></thead>
            <tbody>
              {weeks.map((ws) => {
                const ext = extensionFor(db, ws);
                const locked = isDateLocked(db, ws, now);
                const extActive = ext && new Date(ext.extendedUntil) > now;
                const mins = sumMinutes(db.workEntries.filter((e) => e.entryDate >= ws && e.entryDate <= addDays(ws, 6)));
                return (
                  <tr key={ws}>
                    <td className="nowrap">{fmtWeek(ws)}</td>
                    <td className="num mono">{fmtMins(mins)}</td>
                    <td>
                      {locked ? <Pill tone="lock">Locked</Pill> : extActive
                        ? <Pill tone="warn">Reopened until {fmtDateTime(ext!.extendedUntil)}</Pill>
                        : <span className="small muted">Locks {fmtDateTime(scheduledCutoff(db, ws).toISOString())}</span>}
                    </td>
                    <td className="right nowrap">
                      <span className="row-links">
                        {(locked || extActive) && <button className="link-btn" onClick={() => setExtending(ws)}>{extActive ? 'Change' : 'Extend'}</button>}
                        {extActive && <button className="link-btn" onClick={() => { endExtension(ws); toast('Extension ended — week locked again'); }}>End</button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card">
          <div className="card-head"><h3>Work locations</h3></div>
          <ul className="loc-list">
            {db.workLocations.map((l) => (
              <li key={l.id}>
                <span className={l.isActive ? '' : 'muted strike'}>{l.name}</span>
                <button className="link-btn" onClick={() => { const err = toggleLocation(l.id); if (err) toast(err, 'bad'); }}>{l.isActive ? 'Deactivate' : 'Reactivate'}</button>
              </li>
            ))}
          </ul>
          <div className="add-inline">
            <input className="input" placeholder="Add a location" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} aria-label="New location" />
            <button className="btn" onClick={() => { const err = addLocation(newLoc); if (err) toast(err, 'bad'); else { setNewLoc(''); toast('Location added'); } }}>Add</button>
          </div>

          <div className="card-head"><h3>Allocation thresholds</h3></div>
          <dl className="kv">
            <dt>Normal</dt><dd>under 85%</dd>
            <dt>Approaching allocation</dt><dd>85%</dd>
            <dt>Allocation reached</dt><dd>100%</dd>
            <dt>Significant overrun</dt><dd>110%+</dd>
          </dl>
          <p className="fine">Fixed in V1. These are management signals only — employees are never blocked.</p>
        </section>
      </div>

      {extending && <ExtendSheet ws={extending} adminId={adminId} onClose={() => setExtending(null)} />}
    </div>
  );
}

function ExtendSheet({ ws, adminId, onClose }: { ws: string; adminId: number; onClose: () => void }) {
  const db = useDb();
  const ext = extensionFor(db, ws);
  const base = effectiveCutoff(db, ws);
  const suggested = new Date(Math.max(Date.now(), base.getTime()) + 2 * 86400000);
  suggested.setHours(18, 0, 0, 0);
  const [until, setUntil] = useState(toLocalInput(ext?.extendedUntil ?? suggested.toISOString()));
  const [reason, setReason] = useState(ext?.reason ?? '');
  const [error, setError] = useState('');
  return (
    <Sheet title={`Reopen week of ${fmtWeek(ws)}`} onClose={onClose} footer={
      <>
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => {
          const err = extendCutoff(ws, new Date(until).toISOString(), reason, adminId);
          if (err) setError(err); else { toast('Week reopened for employees'); onClose(); }
        }}>Reopen week</button>
      </>
    }>
      <p className="fine">A one-off extension for this week only — the regular schedule doesn't change. Employees can edit until the new time.</p>
      <Field label="Editable until" htmlFor="ex-until">
        <input id="ex-until" className="input" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
      </Field>
      <Field label="Reason (optional)" htmlFor="ex-r">
        <input id="ex-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Team offsite — logs were delayed" />
      </Field>
      {error && <div className="notice notice-bad">{error}</div>}
    </Sheet>
  );
}
