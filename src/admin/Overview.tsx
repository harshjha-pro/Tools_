import { useDb } from '../store';
import { addDays, fmtDateTime, fmtWeek, today, weekStart } from '../dates';
import {
  activeAssignedProjects, allocationBand, effectiveCutoff, entriesFor, fmtMins, missingDaysThisWeek,
  projectHealth, projectUsedMinutes, sumMinutes, HEALTH_LABEL, isDateLocked,
} from '../logic';
import { Pill, useNow } from '../ui';
import type { AdminTab } from './AdminApp';

/** Screen A1 — org-wide snapshot; every number links into the screen that explains it. */
export function Overview({ go }: { go: (tab: AdminTab) => void }) {
  const db = useDb();
  const now = useNow();
  const t = today();
  const ws = weekStart(t);
  const active = db.employees.filter((e) => e.status === 'active' && e.role === 'employee');
  const orgToday = sumMinutes(db.workEntries.filter((e) => e.entryDate === t));
  const orgWeek = sumMinutes(db.workEntries.filter((e) => e.entryDate >= ws && e.entryDate <= addDays(ws, 6)));
  // Employees without allocations are listed separately, not counted as incomplete.
  const incomplete = active.filter((e) => activeAssignedProjects(db, e.id).length > 0 && missingDaysThisWeek(db, e).length > 0);
  const pendingLeave = db.leaveRequests.filter((l) => l.status === 'pending').length;
  const pendingCorr = db.correctionRequests.filter((c) => c.status === 'pending').length;
  const unassigned = active.filter((e) => activeAssignedProjects(db, e.id).length === 0);
  const projects = db.projects.filter((p) => p.status === 'active').map((p) => {
    const used = projectUsedMinutes(db, p.id) / 60;
    return { p, used, pct: used / p.allocatedHours, health: projectHealth(db, p) };
  }).sort((a, b) => b.pct - a.pct);
  const lastWeek = addDays(ws, -7);

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Overview</h1>
        </div>
      </header>

      <div className="stat-row">
        <button className="stat" onClick={() => go('hours')}><b className="mono">{fmtMins(orgToday)}</b><span>logged today, org-wide</span></button>
        <button className="stat" onClick={() => go('hours')}><b className="mono">{fmtMins(orgWeek)}</b><span>logged this week</span></button>
        <button className={`stat ${incomplete.length ? 'stat-attn' : ''}`} onClick={() => go('employees')}>
          <b className="mono">{incomplete.length}</b><span>{incomplete.length === 1 ? 'employee has' : 'employees have'} days with nothing logged</span>
        </button>
        <button className={`stat ${pendingLeave + pendingCorr ? 'stat-attn' : ''}`} onClick={() => go('requests')}>
          <b className="mono">{pendingLeave + pendingCorr}</b><span>{pendingLeave} leave · {pendingCorr} correction {pendingCorr === 1 ? 'request' : 'requests'}</span>
        </button>
      </div>

      <div className="two-col">
        <section className="card">
          <div className="card-head"><h3>Project Allocation</h3><button className="link-btn" onClick={() => go('projects')}>Projects ›</button></div>
          <table className="table">
            <thead><tr><th>Project</th><th className="num">Hours Logged</th><th>Used</th><th>Health</th></tr></thead>
            <tbody>
              {projects.map(({ p, used, pct, health }) => {
                const band = allocationBand(pct);
                return (
                  <tr key={p.id}>
                    <td><span className="mono">{p.projectCode}</span> {p.name}</td>
                    <td className="num mono">{Math.round(used)} / {p.allocatedHours}h</td>
                    <td>
                      <div className="meter"><span className={`meter-fill tone-bg-${band.tone}`} style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
                      <span className={`small mono tone-${band.tone}`}>{Math.round(pct * 100)}%</span>
                    </td>
                    <td><Pill tone={health}>{HEALTH_LABEL[health]}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="fine">Thresholds: 85% approaching, 100% reached, 110%+ significant overrun. Employees are never blocked from logging.</p>
        </section>

        <section className="card">
          <div className="card-head"><h3>Needs a look</h3></div>
          <ul className="attn-list">
            {incomplete.map((e) => (
              <li key={e.id}>
                <span><b>{e.fullName}</b> — nothing logged {missingDaysThisWeek(db, e).length === 1 ? 'one day' : `${missingDaysThisWeek(db, e).length} days`} this week</span>
              </li>
            ))}
            {unassigned.map((e) => (
              <li key={e.id}><span><b>{e.fullName}</b> has no project allocations yet</span><button className="link-btn" onClick={() => go('assignments')}>Assign ›</button></li>
            ))}
            <li>
              <span>
                Week of {fmtWeek(lastWeek)} is {isDateLocked(db, lastWeek, now) ? 'locked' : `open until ${fmtDateTime(effectiveCutoff(db, lastWeek).toISOString())}`}.
              </span>
              <button className="link-btn" onClick={() => go('settings')}>Weekly lock ›</button>
            </li>
            <li>
              <span>Today: {active.filter((e) => entriesFor(db, e.id, t).length > 0).length} of {active.length} employees have logged work.</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
