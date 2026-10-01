import { useState } from 'react';
import { Home } from './Home';
import { Week } from './Week';
import { Calendar } from './Calendar';
import { Me } from './Me';
import { AddWork } from './AddWork';
import { DayDetail } from './DayDetail';

type Tab = 'home' | 'week' | 'calendar' | 'me';

const TABS: [Tab, string, string][] = [
  ['home', 'Home', 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z'],
  ['week', 'Week', 'M3 5h18v15H3zM3 9h18M8 5v15M13 5v15M18 5v15'],
  ['calendar', 'Calendar', 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'],
  ['me', 'Me', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6'],
];

export function EmployeeApp({ employeeId, onLogout }: { employeeId: number; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState<string | null>(null);

  return (
    <div className="emp">
      <main className="emp-main">
        {tab === 'home' && <Home employeeId={employeeId} onAdd={() => setAdding(true)} onOpenDay={setDay} onGo={setTab} />}
        {tab === 'week' && <Week employeeId={employeeId} actorId={employeeId} onOpenDay={setDay} />}
        {tab === 'calendar' && <Calendar employeeId={employeeId} onOpenDay={setDay} />}
        {tab === 'me' && <Me employeeId={employeeId} onLogout={onLogout} />}
      </main>

      {tab !== 'home' && (
        <button className="fab" onClick={() => setAdding(true)} aria-label="Add work">+</button>
      )}

      <nav className="tabbar" aria-label="Main">
        {TABS.map(([k, label, d]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); window.scrollTo(0, 0); }} aria-current={tab === k ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {adding && <AddWork employeeId={employeeId} actorId={employeeId} onClose={() => setAdding(false)} />}
      {day && <DayDetail employeeId={employeeId} actorId={employeeId} date={day} onClose={() => setDay(null)} />}
    </div>
  );
}
