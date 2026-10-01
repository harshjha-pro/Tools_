import { useState } from 'react';
import { resetDemoData, setSession, useDb, useSession } from './store';
import { EmployeeApp } from './employee/EmployeeApp';
import { AdminApp } from './admin/AdminApp';
import { ConfirmButton, Toaster, toast } from './ui';
import { firstName } from './logic';

export function App() {
  const db = useDb();
  const session = useSession();
  const me = db.employees.find((e) => e.id === session.employeeId && e.status === 'active');

  if (!me) return (<><Login /><Toaster /></>);

  // Admin view acts as the logged-in user if they are an Admin; otherwise (testing only)
  // as the first active Admin, so every Admin change is still attributed to a real Admin.
  const admin = me.role === 'admin' ? me : db.employees.find((e) => e.role === 'admin' && e.status === 'active');
  const view = session.view === 'admin' && admin ? 'admin' : 'employee';

  return (
    <div className="app">
      <TestBar view={view} meName={me.fullName} adminName={admin?.fullName} />
      {view === 'admin' && admin
        ? <AdminApp adminId={admin.id} />
        : <EmployeeApp employeeId={me.id} onLogout={() => setSession({ employeeId: null, view: 'employee' })} />}
      <Toaster />
    </div>
  );
}

/** Prototype-only strip: switch between Employee and Admin views, switch user, reset data. */
function TestBar({ view, meName, adminName }: { view: 'employee' | 'admin'; meName: string; adminName?: string }) {
  const db = useDb();
  const session = useSession();
  return (
    <div className="testbar">
      <span className="testbar-tag">Prototype</span>
      <div className="seg seg-tiny" role="tablist" aria-label="View">
        <button className={view === 'employee' ? 'on' : ''} onClick={() => setSession({ view: 'employee' })}>Employee view</button>
        <button className={view === 'admin' ? 'on' : ''} onClick={() => setSession({ view: 'admin' })}>Admin view</button>
      </div>
      <label className="testbar-user">
        <span className="sr-only">Signed in as</span>
        <select value={session.employeeId ?? ''} onChange={(e) => setSession({ employeeId: Number(e.target.value) })}>
          {db.employees.filter((e) => e.status === 'active').map((e) => (
            <option key={e.id} value={e.id}>{e.fullName}{e.role === 'admin' ? ' (Admin)' : ''}</option>
          ))}
        </select>
      </label>
      <span className="testbar-note">
        {view === 'admin' ? <>Admin actions recorded as <b>{adminName ? firstName(adminName) : '—'}</b></> : <>Logging as <b>{firstName(meName)}</b></>}
      </span>
      <div className="grow" />
      <ConfirmButton label="Reset demo data" confirmLabel="Reset everything" className="testbar-btn" danger onConfirm={() => { resetDemoData(); toast('Demo data reset'); }} />
    </div>
  );
}

/** Screen E1 — identifier-only login for the prototype (no password yet). */
function Login() {
  const db = useDb();
  const [id, setId] = useState('');
  const [error, setError] = useState('');

  function login(identifier: string) {
    const v = identifier.trim().toLowerCase();
    const e = db.employees.find((x) => x.loginEmail === v || x.employeeCode.toLowerCase() === v);
    if (!e) return setError("We couldn't sign you in. Check the email or employee ID.");
    if (e.status === 'offboarded') return setError('This account has been offboarded. Past entries are kept, but sign-in is disabled.');
    setError('');
    setSession({ employeeId: e.id, view: e.role === 'admin' ? 'admin' : 'employee' });
  }

  return (
    <div className="login">
      <div className="login-card">
        <p className="eyebrow">Digifluence</p>
        <h1>Work Tracker</h1>
        <p className="lede">Track work. See progress. Improve performance.</p>
        <form onSubmit={(e) => { e.preventDefault(); login(id); }}>
          <label className="field-label" htmlFor="login-id">Email or employee ID</label>
          <input id="login-id" className="input" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} placeholder="ravi@digifluence.in" autoFocus />
          {error && <div className="notice notice-bad" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block" type="submit">Log in</button>
        </form>
        <div className="demo-accounts">
          <div className="step-label">Demo accounts — tap to sign in</div>
          {db.employees.map((e) => (
            <button key={e.id} className="demo-acct" disabled={e.status !== 'active'} onClick={() => login(e.loginEmail)}>
              <span><b>{e.fullName}</b> <span className="mono muted">{e.employeeCode}</span></span>
              <span className="muted small">{e.role === 'admin' ? 'Admin' : e.status !== 'active' ? 'Offboarded' : db.projectAssignments.some((a) => a.employeeId === e.id && a.isActive) ? 'Employee' : 'New — no projects yet'}</span>
            </button>
          ))}
        </div>
        <p className="fine">Prototype: no password, data is stored only in this browser.</p>
      </div>
    </div>
  );
}
