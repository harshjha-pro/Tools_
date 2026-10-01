import { useState } from 'react';
import { useDb } from '../store';
import { Overview } from './Overview';
import { Hours, type HoursFilter } from './Hours';
import { Assignments, Projects } from './Projects';
import { Employees } from './Employees';
import { Templates } from './Templates';
import { Requests } from './Requests';
import { Settings } from './Settings';

export type AdminTab = 'overview' | 'hours' | 'projects' | 'assignments' | 'employees' | 'templates' | 'requests' | 'settings';

const TABS: [AdminTab, string][] = [
  ['overview', 'Overview'],
  ['hours', 'Hours'],
  ['projects', 'Projects'],
  ['assignments', 'Assignments'],
  ['employees', 'Employees'],
  ['templates', 'Stage templates'],
  ['requests', 'Requests'],
  ['settings', 'Settings'],
];

export function AdminApp({ adminId }: { adminId: number }) {
  const db = useDb();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [hoursFilter, setHoursFilter] = useState<Partial<HoursFilter> | undefined>();
  const pending = db.leaveRequests.filter((l) => l.status === 'pending').length + db.correctionRequests.filter((c) => c.status === 'pending').length;
  const go = (t: AdminTab) => { setHoursFilter(undefined); setTab(t); window.scrollTo(0, 0); };

  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Admin">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}>
            {label}{k === 'requests' && pending > 0 && <span className="badge mono">{pending}</span>}
          </button>
        ))}
      </nav>
      <main className="admin-main">
        {tab === 'overview' && <Overview go={go} />}
        {tab === 'hours' && <Hours key={JSON.stringify(hoursFilter)} adminId={adminId} initial={hoursFilter} />}
        {tab === 'projects' && <Projects adminId={adminId} onEditTemplates={() => go('templates')} />}
        {tab === 'assignments' && <Assignments adminId={adminId} />}
        {tab === 'employees' && (
          <Employees adminId={adminId} onViewEntries={(id) => { setHoursFilter({ employeeId: id, from: '', to: '' }); setTab('hours'); }} />
        )}
        {tab === 'templates' && <Templates adminId={adminId} />}
        {tab === 'requests' && <Requests adminId={adminId} />}
        {tab === 'settings' && <Settings adminId={adminId} />}
      </main>
    </div>
  );
}
