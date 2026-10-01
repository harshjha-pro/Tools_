import { useDb } from '../store';
import { addDays, dow, DAY_LONG, fmtDay, fmtDateTime, range, today, weekStart } from '../dates';
import {
  activeAssignedProjects, effectiveCutoff, entriesFor, entryShortLabel, fmtMins, missingDaysThisWeek,
  projectUsedMinutes, stageName, sumMinutes, firstName, extensionFor,
} from '../logic';
import { Pill, SplitStrip, useNow, colorSlot } from '../ui';

/** Screen E2 — greeting, today's snapshot, one prominent + Add Work. */
export function Home({ employeeId, onAdd, onOpenDay, onGo }: {
  employeeId: number;
  onAdd: () => void;
  onOpenDay: (d: string) => void;
  onGo: (tab: 'week' | 'calendar') => void;
}) {
  const db = useDb();
  const now = useNow();
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const t = today();
  const todays = entriesFor(db, employeeId, t);
  const projects = activeAssignedProjects(db, employeeId);
  const touched = new Set(todays.filter((e) => e.projectId).map((e) => e.projectId)).size;
  const stagesToday = new Set(todays.filter((e) => e.stageId).map((e) => e.stageId)).size;
  const missing = missingDaysThisWeek(db, emp);
  const ws = weekStart(t);
  const cutoff = effectiveCutoff(db, ws);
  const hoursToCutoff = (cutoff.getTime() - now.getTime()) / 3600000;
  const ext = extensionFor(db, addDays(ws, -7));
  const lastWeekReopened = ext && new Date(ext.extendedUntil) > now && emp.joinDate < ws;

  // Average over days that actually have entries this week — context, never a target.
  const weekDays = range(ws, t).map((d) => sumMinutes(entriesFor(db, employeeId, d))).filter((m) => m > 0);
  const avg = weekDays.length ? weekDays.reduce((a, b) => a + b, 0) / weekDays.length : 0;

  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pending = projects.length === 0;

  return (
    <div className="page">
      <header className="hello">
        <p className="eyebrow">{DAY_LONG[dow(t)]}, {fmtDay(t).split(' ').slice(1).join(' ')}</p>
        <h1>{greet}, {firstName(emp.fullName)}</h1>
      </header>

      {pending && (
        <div className="card card-pending">
          <Pill tone="neutral">Allocations pending</Pill>
          <p>You haven't been assigned to a project yet. Admin will add you soon — meanwhile you can log internal work like training or meetings.</p>
        </div>
      )}

      <button className="add-work" onClick={onAdd}>
        <span className="add-plus">+</span>
        <span>
          <b>Add work</b>
          <small>Project → Stage → Time → Save</small>
        </span>
      </button>

      <section className="card today-card" onClick={() => onOpenDay(t)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpenDay(t)}>
        <div className="card-head">
          <h3>Today</h3>
          <span className="link-btn">Details ›</span>
        </div>
        <div className="snapshot">
          <div><b className="mono">{fmtMins(sumMinutes(todays))}</b><span>logged today</span></div>
          <div><b className="mono">{touched}</b><span>{touched === 1 ? 'project' : 'projects'}</span></div>
          <div><b className="mono">{stagesToday}</b><span>{stagesToday === 1 ? 'stage' : 'stages'} worked</span></div>
        </div>
        <SplitStrip db={db} entries={todays} />
        {todays.length > 0 && (
          <ul className="mini-list">
            {todays.map((e) => (
              <li key={e.id}>
                <span className={`dot bg-${colorSlot(e)}`} />
                <span className="mono">{entryShortLabel(db, e)}</span>
                <span className="muted">{stageName(db, e.stageId)}</span>
                <span className="grow" />
                <span className="mono">{fmtMins(e.hours * 60 + e.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {missing.length > 0 && (
        <div className="nudge">
          <span>
            {missing.length === 1
              ? <>You haven't logged any work for <b>{DAY_LONG[dow(missing[0])]}</b>.</>
              : <>No work logged for <b>{missing.map((d) => DAY_LONG[dow(d)]).join(', ')}</b>.</>}
          </span>
          <button className="link-btn" onClick={() => onOpenDay(missing[0])}>Add it ›</button>
        </div>
      )}

      <div className="tiles">
        <button className="tile" onClick={() => onGo('week')}>
          <span className="tile-label">This week</span>
          <b className="mono">{fmtMins(range(ws, addDays(ws, 6)).reduce((s, d) => s + sumMinutes(entriesFor(db, employeeId, d)), 0))}</b>
          <small>{avg ? `Your average: ${(avg / 60).toFixed(1)} hrs/day` : 'Nothing logged yet'}</small>
        </button>
        <button className="tile" onClick={() => onGo('calendar')}>
          <span className="tile-label">Weekly lock</span>
          <b className="mono">{hoursToCutoff > 48 ? `${Math.floor(hoursToCutoff / 24)}d` : `${Math.max(0, Math.floor(hoursToCutoff))}h`}</b>
          <small>Locks {fmtDateTime(cutoff.toISOString())}</small>
        </button>
      </div>
      {lastWeekReopened && (
        <div className="notice">Admin reopened last week until {fmtDateTime(ext!.extendedUntil)} — you can still edit it.</div>
      )}

      {projects.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>My projects</h3></div>
          <ul className="proj-list">
            {projects.map((p) => {
              const used = projectUsedMinutes(db, p.id);
              const pct = used / (p.allocatedHours * 60);
              return (
                <li key={p.id}>
                  <span className={`dot bg-${colorSlot({ projectId: p.id })}`} />
                  <span className="mono">{p.projectCode}</span>
                  <span className="proj-name">{p.name}</span>
                  <span className="grow" />
                  <span className={`mono small ${pct >= 1 ? 'tone-bad' : pct >= 0.85 ? 'tone-warn' : 'muted'}`}>
                    {Math.round(used / 60)} / {p.allocatedHours}h
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="fine">Hours logged against each Project Allocation, across the whole team.</p>
        </section>
      )}
    </div>
  );
}
