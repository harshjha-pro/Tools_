import { useEffect, useState } from 'react';
import { getDb, useDb } from '../store';
import type { WorkEntry } from '../types';
import { addDays, dow, fmtWeek, range, today, weekStart, DAY_SHORT, fmtDateTime } from '../dates';
import {
  activeAssignedProjects, effectiveCutoff, fmtMins, isDateLocked, parseDuration, splitMinutes, stagesFor, sumMinutes,
  MAX_ENTRY_MINUTES, approvedLeaveOn,
} from '../logic';
import { copyDay, createEntries, deleteEntry, updateEntry } from '../actions';
import { Pill, Sheet, toast, useNow, colorSlot } from '../ui';

type RowKey = string; // "p:<projectId>:<stageId>" or "i:<categoryId>"

const keyOf = (e: Pick<WorkEntry, 'projectId' | 'stageId' | 'internalCategoryId'>): RowKey =>
  e.projectId ? `p:${e.projectId}:${e.stageId}` : `i:${e.internalCategoryId}`;

/**
 * Screen E4 — Project × Stage grid across the week. Each cell auto-saves on blur.
 * Deliberately no per-day target: column totals show what was logged, nothing more.
 */
export function Week({ employeeId, actorId, onOpenDay }: { employeeId: number; actorId: number; onOpenDay: (d: string) => void }) {
  const db = useDb();
  const now = useNow();
  const t = today();
  const [ws, setWs] = useState(weekStart(t));
  const [extraRows, setExtraRows] = useState<RowKey[]>([]);
  const [adding, setAdding] = useState(false);
  const [showWeekend, setShowWeekend] = useState(false);
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const isAdmin = actorId !== employeeId;

  useEffect(() => setExtraRows([]), [ws]);

  const allDays = range(ws, addDays(ws, 6));
  const weekEntries = db.workEntries.filter((e) => e.employeeId === employeeId && e.entryDate >= ws && e.entryDate <= allDays[6]);
  const hasWeekendEntries = weekEntries.some((e) => dow(e.entryDate) % 6 === 0);
  const days = showWeekend || hasWeekendEntries ? allDays : allDays.slice(0, 5);
  const locked = isDateLocked(db, ws, now);
  const readOnly = locked && !isAdmin;
  const cutoff = effectiveCutoff(db, ws);

  const rowKeys: RowKey[] = [];
  for (const e of weekEntries) if (!rowKeys.includes(keyOf(e))) rowKeys.push(keyOf(e));
  for (const k of extraRows) if (!rowKeys.includes(k)) rowKeys.push(k);
  rowKeys.sort((a, b) => rowSort(a) - rowSort(b));

  function rowSort(k: RowKey) {
    const [kind, a, b] = k.split(':');
    if (kind === 'i') return 1e6 + Number(a);
    const p = db.projects.find((x) => x.id === Number(a));
    const s = db.stageTemplateStages.find((x) => x.id === Number(b));
    return Number(a) * 1000 + (s?.sequenceOrder ?? 0) + (p ? 0 : 1e5);
  }

  function rowLabel(k: RowKey) {
    const [kind, a, b] = k.split(':');
    if (kind === 'i') return { code: 'Internal', name: db.internalCategories.find((c) => c.id === Number(a))?.name ?? '', slot: 'c0' };
    const p = db.projects.find((x) => x.id === Number(a));
    const s = db.stageTemplateStages.find((x) => x.id === Number(b));
    return { code: p?.projectCode ?? '', name: s?.stageName ?? '', slot: colorSlot({ projectId: Number(a) }) };
  }

  function cellEntries(k: RowKey, d: string) {
    return weekEntries.filter((e) => e.entryDate === d && keyOf(e) === k);
  }

  /** Returns false when the value was rejected, so the cell can snap back. */
  function commit(k: RowKey, d: string, raw: string): boolean {
    const mins = parseDuration(raw);
    const existing = cellEntries(k, d);
    const current = sumMinutes(existing);
    const fail = (msg: string) => (toast(msg, 'bad'), false);
    if (mins === null) return fail('Use a time like 2, 1.5 or 2:30');
    if (mins === current) return false;
    if (mins > MAX_ENTRY_MINUTES) return fail('One entry can be at most 8h 45m');
    if (d < emp.joinDate) return fail('That day is before the join date');
    const [kind, a, b] = k.split(':');
    let err: string | null = null;
    if (existing.length === 0) {
      if (mins === 0) return false;
      err = createEntries(employeeId, [d], {
        projectId: kind === 'p' ? Number(a) : null,
        internalCategoryId: kind === 'i' ? Number(a) : null,
        stageId: kind === 'p' ? Number(b) : null,
        ...splitMinutes(mins),
        description: '', deliverable: '', locationId: emp.defaultLocationId,
      }, actorId);
    } else if (mins === 0) {
      err = deleteEntry(existing[0].id, actorId);
    } else {
      err = updateEntry(existing[0].id, splitMinutes(mins), actorId);
    }
    if (err) return fail(err);
    return true;
  }

  function copyPrevWeek() {
    const prev = addDays(ws, -7);
    let copied = 0;
    for (let i = 0; i < 7; i++) {
      const from = addDays(prev, i);
      const to = addDays(ws, i);
      const db2 = getDb();
      if (db2.workEntries.some((e) => e.employeeId === employeeId && e.entryDate === to)) continue;
      if (!db2.workEntries.some((e) => e.employeeId === employeeId && e.entryDate === from)) continue;
      if (to < emp.joinDate) continue;
      if (!copyDay(employeeId, from, to, actorId)) copied++;
    }
    toast(copied ? `Copied ${copied} ${copied === 1 ? 'day' : 'days'} from last week — adjust as needed` : 'Nothing to copy into empty days', copied ? 'ok' : 'warn');
  }

  const weekTotal = sumMinutes(weekEntries);

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <p className="eyebrow">Week view</p>
          <h1>{fmtWeek(ws)}</h1>
        </div>
        <div className="week-nav">
          <button className="icon-btn" onClick={() => setWs(addDays(ws, -7))} aria-label="Previous week">‹</button>
          <button className="btn btn-quiet btn-sm" onClick={() => setWs(weekStart(t))} disabled={ws === weekStart(t)}>This week</button>
          <button className="icon-btn" onClick={() => setWs(addDays(ws, 7))} aria-label="Next week">›</button>
        </div>
      </header>

      <div className="week-meta">
        <span className="mono"><b>{fmtMins(weekTotal)}</b> logged this week</span>
        {locked ? (
          <Pill tone="lock">{isAdmin ? 'Locked for employee' : 'Locked'}</Pill>
        ) : (
          <span className="muted">Locks {fmtDateTime(cutoff.toISOString())}</span>
        )}
      </div>
      {readOnly && <div className="notice notice-lock">This week is past the weekly cutoff. Tap a day to request a correction.</div>}

      <div className="grid-wrap">
        <table className="wgrid">
          <thead>
            <tr>
              <th className="wgrid-row-h">Work</th>
              {days.map((d) => (
                <th key={d} className={`${d === t ? 'is-today' : ''} ${d > t ? 'is-future' : ''}`}>
                  <button className="day-head" onClick={() => onOpenDay(d)}>
                    <span>{DAY_SHORT[dow(d)]}</span><b>{Number(d.slice(8))}</b>
                    {approvedLeaveOn(db, employeeId, d) && <i className="leave-dot" title="Leave" />}
                  </button>
                </th>
              ))}
              <th className="wgrid-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {rowKeys.length === 0 && (
              <tr><td colSpan={days.length + 2} className="wgrid-empty">Nothing logged this week yet. Add a row to start, or copy last week.</td></tr>
            )}
            {rowKeys.map((k) => {
              const lbl = rowLabel(k);
              return (
                <tr key={k}>
                  <th className="wgrid-row-h">
                    <span className="row-code"><span className={`dot bg-${lbl.slot}`} /><span className="mono">{lbl.code}</span></span>
                    <span className="row-name">{lbl.name}</span>
                  </th>
                  {days.map((d) => {
                    const ce = cellEntries(k, d);
                    const mins = sumMinutes(ce);
                    const cellLocked = readOnly || (d < emp.joinDate);
                    return (
                      <td key={d} className={`${d === t ? 'is-today' : ''} ${d > t ? 'is-future' : ''}`}>
                        {cellLocked || ce.length > 1 ? (
                          <button className="cell-ro mono" onClick={() => onOpenDay(d)} title={ce.length > 1 ? 'Several entries — open the day to edit' : 'Locked'}>
                            {mins ? fmtMins(mins) : '·'}
                            {ce.length > 1 && <sup>{ce.length}</sup>}
                          </button>
                        ) : (
                          <CellInput key={`${k}-${d}-${mins}`} value={mins} onCommit={(raw) => commit(k, d, raw)} label={`${lbl.code} ${lbl.name} ${d}`} />
                        )}
                      </td>
                    );
                  })}
                  <td className="wgrid-total mono">{fmtMins(sumMinutes(weekEntries.filter((e) => keyOf(e) === k)))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="wgrid-row-h">Day total</th>
              {days.map((d) => (
                <td key={d} className={`mono ${d === t ? 'is-today' : ''}`}>{fmtMins(sumMinutes(weekEntries.filter((e) => e.entryDate === d)))}</td>
              ))}
              <td className="wgrid-total mono"><b>{fmtMins(weekTotal)}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="week-actions">
        {!readOnly && <button className="btn" onClick={() => setAdding(true)}>+ Add row</button>}
        {!readOnly && !isAdmin && <button className="btn btn-quiet" onClick={copyPrevWeek}>Copy last week</button>}
        {!hasWeekendEntries && (
          <button className="btn btn-quiet" onClick={() => setShowWeekend(!showWeekend)}>{showWeekend ? 'Hide weekend' : 'Show weekend'}</button>
        )}
      </div>
      <p className="fine">Type a time in any cell — <span className="mono">2</span>, <span className="mono">1.5</span> or <span className="mono">2:30</span> — it saves when you leave the cell. Clear a cell to remove it.</p>

      {adding && (
        <AddRowSheet employeeId={employeeId} existing={rowKeys} onClose={() => setAdding(false)} onAdd={(k) => { setExtraRows([...extraRows, k]); setAdding(false); }} />
      )}
    </div>
  );
}

function CellInput({ value, onCommit, label }: { value: number; onCommit: (raw: string) => boolean; label: string }) {
  const initial = value ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}` : '';
  const [v, setV] = useState(initial);
  return (
    <input
      className="cell-in mono"
      inputMode="decimal"
      aria-label={label}
      value={v}
      placeholder="·"
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => { if (v !== initial && !onCommit(v)) setV(initial); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setV(initial); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

function AddRowSheet({ employeeId, existing, onClose, onAdd }: {
  employeeId: number; existing: RowKey[]; onClose: () => void; onAdd: (k: RowKey) => void;
}) {
  const db = useDb();
  const [projectId, setProjectId] = useState<number | null>(null);
  const projects = activeAssignedProjects(db, employeeId);
  const project = db.projects.find((p) => p.id === projectId);
  return (
    <Sheet title="Add a row" onClose={onClose}>
      <div className="step-label">Project</div>
      <div className="choice-list">
        {projects.map((p) => (
          <button key={p.id} className={`choice ${projectId === p.id ? 'on' : ''}`} onClick={() => setProjectId(p.id)}>
            <span className={`dot bg-${colorSlot({ projectId: p.id })}`} />
            <span className="mono code">{p.projectCode}</span><span className="choice-name">{p.name}</span>
          </button>
        ))}
      </div>
      {project && (
        <>
          <div className="step-label">Stage</div>
          <div className="chips">
            {stagesFor(db, project.stageTemplateId).map((s) => {
              const k = `p:${project.id}:${s.id}`;
              return <button key={s.id} className="chip" disabled={existing.includes(k)} onClick={() => onAdd(k)}>{s.stageName}</button>;
            })}
          </div>
        </>
      )}
      <div className="step-sublabel">Internal work</div>
      <div className="chips">
        {db.internalCategories.filter((c) => c.isActive).map((c) => {
          const k = `i:${c.id}`;
          return <button key={c.id} className="chip" disabled={existing.includes(k)} onClick={() => onAdd(k)}>{c.name}</button>;
        })}
      </div>
    </Sheet>
  );
}

