import { useState } from 'react';
import { useDb } from '../store';
import type { WorkEntry } from '../types';
import { addDays, fmtDay, fmtDateTime, today, weekStart } from '../dates';
import {
  adminAttribution, entryLockStatus, entryShortLabel, fmtHrs, fmtMins, locationName, stageName, stagesFor, sumMinutes,
  employeeName,
} from '../logic';
import { deleteEntry, updateEntry } from '../actions';
import { ConfirmButton, Empty, Field, Pill, Sheet, toast, useNow, colorSlot } from '../ui';

export interface HoursFilter {
  employeeId: number | 0;
  projectKey: string; // '' | 'p:<id>' | 'internal'
  from: string;
  to: string;
  locationId: number | 0;
  stageName: string;
}

export function defaultHoursFilter(): HoursFilter {
  const ws = weekStart(today());
  return { employeeId: 0, projectKey: '', from: ws, to: addDays(ws, 6), locationId: 0, stageName: '' };
}

/** Screen A8 — every Work Entry in the org, filterable, editable without lock restriction. */
export function Hours({ adminId, initial }: { adminId: number; initial?: Partial<HoursFilter> }) {
  const db = useDb();
  const now = useNow();
  const [f, setF] = useState<HoursFilter>({ ...defaultHoursFilter(), ...initial });
  const [editing, setEditing] = useState<WorkEntry | null>(null);
  const set = (patch: Partial<HoursFilter>) => setF({ ...f, ...patch });

  const rows = db.workEntries
    .filter((e) =>
      (!f.employeeId || e.employeeId === f.employeeId) &&
      (!f.projectKey || (f.projectKey === 'internal' ? !e.projectId : e.projectId === Number(f.projectKey.slice(2)))) &&
      (!f.from || e.entryDate >= f.from) && (!f.to || e.entryDate <= f.to) &&
      (!f.locationId || e.locationId === f.locationId) &&
      (!f.stageName || stageName(db, e.stageId) === f.stageName))
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || a.employeeId - b.employeeId);
  const total = sumMinutes(rows);
  const projectMins = sumMinutes(rows.filter((r) => r.projectId));
  const allStageNames = [...new Set(db.stageTemplateStages.map((s) => s.stageName))].sort();

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div><p className="eyebrow">Admin</p><h1>Hours</h1></div>
      </header>

      <div className="filters">
        <select className="input" aria-label="Employee" value={f.employeeId} onChange={(e) => set({ employeeId: Number(e.target.value) })}>
          <option value={0}>All employees</option>
          {db.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.status === 'offboarded' ? ' (offboarded)' : ''}</option>)}
        </select>
        <select className="input" aria-label="Project" value={f.projectKey} onChange={(e) => set({ projectKey: e.target.value })}>
          <option value="">All projects</option>
          {db.projects.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.projectCode} — {p.name}</option>)}
          <option value="internal">Internal work only</option>
        </select>
        <input className="input" type="date" aria-label="From" value={f.from} onChange={(e) => set({ from: e.target.value })} />
        <input className="input" type="date" aria-label="To" value={f.to} onChange={(e) => set({ to: e.target.value })} />
        <select className="input" aria-label="Location" value={f.locationId} onChange={(e) => set({ locationId: Number(e.target.value) })}>
          <option value={0}>All locations</option>
          {db.workLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="input" aria-label="Stage" value={f.stageName} onChange={(e) => set({ stageName: e.target.value })}>
          <option value="">All stages</option>
          {allStageNames.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-quiet btn-sm" onClick={() => setF(defaultHoursFilter())}>Reset</button>
      </div>

      <div className="week-meta">
        <span className="mono"><b>{fmtMins(total)}</b> across {rows.length} entries</span>
        <span className="muted">Project {fmtMins(projectMins)} · Internal {fmtMins(total - projectMins)}</span>
      </div>

      {rows.length === 0 ? (
        <Empty title="No entries match these filters">Try widening the date range.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table table-hover">
            <thead>
              <tr><th>Date</th><th>Employee</th><th>Project</th><th>Stage</th><th className="num">Hrs</th><th>Location</th><th>Description</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const st = entryLockStatus(db, e, now);
                const attr = adminAttribution(db, e);
                return (
                  <tr key={e.id} onClick={() => setEditing(e)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setEditing(e)}>
                    <td className="nowrap">{fmtDay(e.entryDate)}</td>
                    <td className="nowrap">{employeeName(db, e.employeeId)}</td>
                    <td className="nowrap"><span className={`dot bg-${colorSlot(e)}`} /> <span className="mono">{entryShortLabel(db, e)}</span></td>
                    <td>{stageName(db, e.stageId) || <span className="muted">—</span>}</td>
                    <td className="num mono">{fmtHrs(e.hours * 60 + e.minutes)}</td>
                    <td>{locationName(db, e.locationId)}</td>
                    <td className="clip">{e.description}{e.deliverable && <span className="muted"> → {e.deliverable}</span>}{attr && <div className="entry-attr">{attr}</div>}</td>
                    <td>
                      {st === 'unlocked' ? <span className="muted small">Open</span>
                        : st === 'locked' ? <Pill tone="lock">Locked</Pill> : <Pill tone="warn">Correction</Pill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <AdminEntrySheet entry={editing} adminId={adminId} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Full-field edit including reassigning employee/project. Every change is written to the audit log. */
export function AdminEntrySheet({ entry, adminId, onClose }: { entry: WorkEntry; adminId: number; onClose: () => void }) {
  const db = useDb();
  const now = useNow();
  const [e, setE] = useState(entry);
  const [error, setError] = useState('');
  const project = db.projects.find((p) => p.id === e.projectId);
  const stages = project ? stagesFor(db, project.stageTemplateId, true) : [];
  const history = db.auditLog.filter((a) => a.entityType === 'work_entry' && a.entityId === entry.id).slice().reverse();
  const created = db.employees.find((x) => x.id === entry.createdBy);
  const set = (patch: Partial<WorkEntry>) => setE({ ...e, ...patch });
  const st = entryLockStatus(db, entry, now);

  return (
    <Sheet title="Edit entry" wide onClose={onClose} footer={
      <>
        <ConfirmButton label="Delete" confirmLabel="Confirm delete" danger onConfirm={() => { deleteEntry(entry.id, adminId); toast('Entry deleted'); onClose(); }} />
        <div className="grow" />
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => {
          const patch: Partial<WorkEntry> = {};
          (Object.keys(e) as (keyof WorkEntry)[]).forEach((k) => { if (e[k] !== entry[k]) (patch as Record<string, unknown>)[k] = e[k]; });
          if (!Object.keys(patch).length) return onClose();
          const err = updateEntry(entry.id, patch, adminId);
          if (err) setError(err); else { toast('Saved — attributed to you as Admin'); onClose(); }
        }}>Save changes</button>
      </>
    }>
      {st !== 'unlocked' && <div className="notice notice-lock">This entry is locked for the employee. Admin edits are allowed and recorded.</div>}
      <div className="row2">
        <Field label="Employee" htmlFor="ae-emp">
          <select id="ae-emp" className="input" value={e.employeeId} onChange={(x) => set({ employeeId: Number(x.target.value) })}>
            {db.employees.map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}
          </select>
        </Field>
        <Field label="Date" htmlFor="ae-date">
          <input id="ae-date" className="input" type="date" value={e.entryDate} onChange={(x) => x.target.value && set({ entryDate: x.target.value })} />
        </Field>
      </div>
      <div className="row2">
        <Field label="Project / category" htmlFor="ae-proj">
          <select id="ae-proj" className="input" value={e.projectId ? `p${e.projectId}` : `i${e.internalCategoryId}`} onChange={(x) => {
            const v = x.target.value;
            if (v.startsWith('p')) {
              const p = db.projects.find((pp) => pp.id === Number(v.slice(1)))!;
              set({ projectId: p.id, internalCategoryId: null, stageId: stagesFor(db, p.stageTemplateId)[0]?.id ?? null });
            } else set({ projectId: null, internalCategoryId: Number(v.slice(1)), stageId: null });
          }}>
            <optgroup label="Projects">
              {db.projects.map((p) => <option key={p.id} value={`p${p.id}`}>{p.projectCode} — {p.name}{p.status === 'archived' ? ' (archived)' : ''}</option>)}
            </optgroup>
            <optgroup label="Internal">
              {db.internalCategories.map((c) => <option key={c.id} value={`i${c.id}`}>{c.name}</option>)}
            </optgroup>
          </select>
        </Field>
        {project && (
          <Field label="Stage" htmlFor="ae-stage">
            <select id="ae-stage" className="input" value={e.stageId ?? ''} onChange={(x) => set({ stageId: Number(x.target.value) })}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.stageName}{s.isActive ? '' : ' (retired)'}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="row3">
        <Field label="Hours" htmlFor="ae-h">
          <select id="ae-h" className="input" value={e.hours} onChange={(x) => set({ hours: Number(x.target.value) })}>
            {Array.from({ length: 9 }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Minutes" htmlFor="ae-m">
          <select id="ae-m" className="input" value={e.minutes} onChange={(x) => set({ minutes: Number(x.target.value) })}>
            {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Location" htmlFor="ae-loc">
          <select id="ae-loc" className="input" value={e.locationId} onChange={(x) => set({ locationId: Number(x.target.value) })}>
            {db.workLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description" htmlFor="ae-d">
        <input id="ae-d" className="input" maxLength={150} value={e.description} onChange={(x) => set({ description: x.target.value })} />
      </Field>
      <Field label="Deliverable / output" htmlFor="ae-dl">
        <input id="ae-dl" className="input" value={e.deliverable} onChange={(x) => set({ deliverable: x.target.value })} />
      </Field>
      {error && <div className="notice notice-bad">{error}</div>}

      <div className="history">
        <div className="step-label">Audit trail</div>
        <div className="history-row"><span className="muted">{fmtDateTime(entry.createdAt)}</span><span>Created by {created?.fullName ?? 'unknown'}</span></div>
        {history.filter((h) => h.action !== 'create').map((h) => (
          <div key={h.id} className="history-row">
            <span className="muted">{fmtDateTime(h.performedAt)}</span>
            <span>
              {employeeName(db, h.performedBy)} · {h.action === 'update' ? <>changed <b>{h.fieldName}</b> {h.oldValue} → {h.newValue}</> : h.action.replace('_', ' ')}
              {h.notes && <span className="muted"> ({h.notes})</span>}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
