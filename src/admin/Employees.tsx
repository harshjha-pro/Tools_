import { useState } from 'react';
import { useDb } from '../store';
import type { Employee } from '../types';
import { addDays, fmtDay, today, weekStart } from '../dates';
import { activeAssignedProjects, fmtMins, missingDaysThisWeek, sumMinutes, locationName } from '../logic';
import { createEmployee, nextEmployeeCode, offboardEmployee, updateEmployee } from '../actions';
import { ConfirmButton, Empty, Field, Pill, Sheet, toast } from '../ui';
import { Calendar } from '../employee/Calendar';
import { DayDetail } from '../employee/DayDetail';
import { Week } from '../employee/Week';

/** Screens A2 + A3 — roster, profile, offboarding, and any employee's calendar/week. */
export function Employees({ adminId, onViewEntries }: { adminId: number; onViewEntries: (employeeId: number) => void }) {
  const db = useDb();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'offboarded' | 'all'>('active');
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const t = today();
  const ws = weekStart(t);
  const rows = db.employees.filter((e) =>
    (status === 'all' || e.status === status) &&
    (!q || `${e.fullName} ${e.employeeCode}`.toLowerCase().includes(q.toLowerCase())));

  if (open) {
    const emp = db.employees.find((e) => e.id === open)!;
    return <EmployeeDetail emp={emp} adminId={adminId} onBack={() => setOpen(null)} onViewEntries={() => onViewEntries(emp.id)} />;
  }

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div><p className="eyebrow">Admin</p><h1>Employees</h1></div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add employee</button>
      </header>
      <div className="filters">
        <input className="input" placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employees" />
        <div className="seg seg-inline">
          {(['active', 'offboarded', 'all'] as const).map((s) => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? <Empty title="No one matches" /> : (
        <div className="table-wrap">
          <table className="table table-hover">
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th className="num">Projects</th><th className="num">This week</th><th>Missing days</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((e) => {
                const missing = e.role === 'employee' && e.status === 'active' ? missingDaysThisWeek(db, e) : [];
                return (
                  <tr key={e.id} onClick={() => setOpen(e.id)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setOpen(e.id)}>
                    <td className="mono">{e.employeeCode}</td>
                    <td>{e.fullName}</td>
                    <td>{e.role === 'admin' ? 'Admin' : 'Employee'}</td>
                    <td className="num mono">{activeAssignedProjects(db, e.id).length}</td>
                    <td className="num mono">{fmtMins(sumMinutes(db.workEntries.filter((w) => w.employeeId === e.id && w.entryDate >= ws && w.entryDate <= addDays(ws, 6))))}</td>
                    <td>{missing.length ? <span className="tone-warn">{missing.map((d) => fmtDay(d).split(' ')[0]).join(', ')}</span> : <span className="muted">—</span>}</td>
                    <td><Pill tone={e.status === 'active' ? 'ok' : 'neutral'}>{e.status}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddEmployee adminId={adminId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function EmployeeDetail({ emp, adminId, onBack, onViewEntries }: { emp: Employee; adminId: number; onBack: () => void; onViewEntries: () => void }) {
  const db = useDb();
  const [tab, setTab] = useState<'calendar' | 'week'>('calendar');
  const [day, setDay] = useState<string | null>(null);
  const projects = activeAssignedProjects(db, emp.id);
  const offboarded = emp.status === 'offboarded';

  return (
    <div className="page page-wide">
      <button className="link-btn back" onClick={onBack}>‹ All employees</button>
      <header className="page-head">
        <div><p className="eyebrow mono">{emp.employeeCode}</p><h1>{emp.fullName}</h1></div>
        <div className="head-actions">
          <button className="btn btn-quiet" onClick={onViewEntries}>View entries</button>
          {!offboarded && emp.id !== adminId && (
            <ConfirmButton label="Offboard" confirmLabel="Confirm — revoke login" danger onConfirm={() => { offboardEmployee(emp.id, adminId); toast(`${emp.fullName} offboarded. Their history stays.`); }} />
          )}
        </div>
      </header>

      <div className="two-col">
        <section className="card">
          <dl className="kv">
            <dt>Login</dt><dd>{emp.loginEmail}</dd>
            <dt>Joined</dt><dd>{fmtDay(emp.joinDate)}</dd>
            <dt>Status</dt><dd><Pill tone={offboarded ? 'neutral' : 'ok'}>{emp.status}</Pill></dd>
          </dl>
          <div className="row2">
            <Field label="Default location" htmlFor="ed-loc">
              <select id="ed-loc" className="input" disabled={offboarded} value={emp.defaultLocationId}
                onChange={(e) => { updateEmployee(emp.id, { defaultLocationId: Number(e.target.value) }); toast('Saved'); }}>
                {db.workLocations.filter((l) => l.isActive || l.id === emp.defaultLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Employee can change location" htmlFor="ed-le">
              <button id="ed-le" className={`toggle ${emp.locationEditableByEmployee ? 'on' : ''}`} role="switch" aria-checked={emp.locationEditableByEmployee} disabled={offboarded}
                onClick={() => { updateEmployee(emp.id, { locationEditableByEmployee: !emp.locationEditableByEmployee }); toast('Saved'); }}><span /></button>
            </Field>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3>Assigned projects</h3></div>
          {projects.length === 0 ? <Empty title="Allocations pending">Assign projects from the Assignments screen.</Empty> : (
            <ul className="proj-list">{projects.map((p) => <li key={p.id}><span className="mono">{p.projectCode}</span><span className="proj-name">{p.name}</span></li>)}</ul>
          )}
          <p className="fine">Default location: {locationName(db, emp.defaultLocationId)}</p>
        </section>
      </div>

      <div className="seg seg-inline">
        <button className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}>Calendar</button>
        <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>Week</button>
      </div>
      {tab === 'calendar' ? <Calendar employeeId={emp.id} onOpenDay={setDay} /> : <Week employeeId={emp.id} actorId={adminId} onOpenDay={setDay} />}
      {day && <DayDetail employeeId={emp.id} actorId={adminId} date={day} onClose={() => setDay(null)} />}
    </div>
  );
}

function AddEmployee({ adminId, onClose }: { adminId: number; onClose: () => void }) {
  const db = useDb();
  const [fullName, setName] = useState('');
  const [loginEmail, setEmail] = useState('');
  const [role, setRole] = useState<'employee' | 'admin'>('employee');
  const [loc, setLoc] = useState(db.workLocations.find((l) => l.isActive)!.id);
  const [editable, setEditable] = useState(false);
  const [joinDate, setJoin] = useState(today());
  const [error, setError] = useState('');
  return (
    <Sheet title={<>Add employee <span className="mono muted">{nextEmployeeCode(db)}</span></>} onClose={onClose} footer={
      <>
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => {
          const err = createEmployee({ fullName, loginEmail, role, defaultLocationId: loc, locationEditableByEmployee: editable, joinDate }, adminId);
          if (err) setError(err); else { toast(`${fullName} added — they can log in with ${loginEmail}`); onClose(); }
        }}>Add employee</button>
      </>
    }>
      <Field label="Full name" htmlFor="ne-n"><input id="ne-n" className="input" value={fullName} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Login email" htmlFor="ne-e"><input id="ne-e" className="input" type="email" value={loginEmail} onChange={(e) => setEmail(e.target.value)} placeholder="name@digifluence.in" /></Field>
      <div className="row2">
        <Field label="Role" htmlFor="ne-r">
          <select id="ne-r" className="input" value={role} onChange={(e) => setRole(e.target.value as 'employee' | 'admin')}>
            <option value="employee">Employee</option><option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Join date" htmlFor="ne-j"><input id="ne-j" className="input" type="date" value={joinDate} onChange={(e) => setJoin(e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="Default location" htmlFor="ne-l">
          <select id="ne-l" className="input" value={loc} onChange={(e) => setLoc(Number(e.target.value))}>
            {db.workLocations.filter((l) => l.isActive).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Employee can change location" htmlFor="ne-le">
          <button id="ne-le" className={`toggle ${editable ? 'on' : ''}`} role="switch" aria-checked={editable} onClick={() => setEditable(!editable)}><span /></button>
        </Field>
      </div>
      {error && <div className="notice notice-bad">{error}</div>}
    </Sheet>
  );
}
