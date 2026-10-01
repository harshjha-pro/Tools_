import { useState } from 'react';
import { getDb, useDb } from '../store';
import type { Project } from '../types';
import { fmtDay } from '../dates';
import {
  allocationBand, projectHealth, projectUsedMinutes, stagesFor, HEALTH_LABEL, employeeName, sumMinutes, stageName,
} from '../logic';
import { archiveProject, createProject, nextProjectCode, setAssignment, updateProject } from '../actions';
import { ConfirmButton, Empty, Field, Pill, Sheet, toast } from '../ui';

/** Screens A4 + A5 — project list, create/edit, archive. */
export function Projects({ adminId, onEditTemplates }: { adminId: number; onEditTemplates: () => void }) {
  const db = useDb();
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const rows = db.projects.filter((p) =>
    (status === 'all' || p.status === status) &&
    (!q || `${p.projectCode} ${p.name}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div><p className="eyebrow">Admin</p><h1>Projects</h1></div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Create project</button>
      </header>
      <div className="filters">
        <input className="input" placeholder="Search ID or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
        <div className="seg seg-inline">
          {(['active', 'archived', 'all'] as const).map((s) => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? <Empty title="No projects here" /> : (
        <div className="table-wrap">
          <table className="table table-hover">
            <thead><tr><th>ID</th><th>Name</th><th>Stage template</th><th className="num">Allocated</th><th className="num">Hours Logged</th><th>Health</th><th>People</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const used = projectUsedMinutes(db, p.id) / 60;
                const h = projectHealth(db, p);
                const people = db.projectAssignments.filter((a) => a.projectId === p.id && a.isActive).length;
                return (
                  <tr key={p.id} onClick={() => setEditing(p)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setEditing(p)}>
                    <td className="mono">{p.projectCode}</td>
                    <td>{p.name}</td>
                    <td>{db.stageTemplates.find((t) => t.id === p.stageTemplateId)?.name}</td>
                    <td className="num mono">{p.allocatedHours}h</td>
                    <td className="num mono">{used.toFixed(1)}h <span className={`small tone-${allocationBand(used / p.allocatedHours).tone}`}>({Math.round((used / p.allocatedHours) * 100)}%)</span></td>
                    <td><Pill tone={h}>{HEALTH_LABEL[h]}</Pill></td>
                    <td className="mono">{people}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ProjectSheet project={editing === 'new' ? null : editing} adminId={adminId} onClose={() => setEditing(null)} onEditTemplates={() => { setEditing(null); onEditTemplates(); }} />
      )}
    </div>
  );
}

function ProjectSheet({ project, adminId, onClose, onEditTemplates }: {
  project: Project | null; adminId: number; onClose: () => void; onEditTemplates: () => void;
}) {
  const db = useDb();
  const def = db.stageTemplates.find((t) => t.isDefault) ?? db.stageTemplates[0];
  const [name, setName] = useState(project?.name ?? '');
  const [templateId, setTemplateId] = useState(project?.stageTemplateId ?? def.id);
  const [allocated, setAllocated] = useState(project ? String(project.allocatedHours) : '');
  const [start, setStart] = useState(project?.plannedStartDate ?? '');
  const [end, setEnd] = useState(project?.plannedEndDate ?? '');
  const [people, setPeople] = useState<number[]>(
    project ? db.projectAssignments.filter((a) => a.projectId === project.id && a.isActive).map((a) => a.employeeId) : [],
  );
  const [error, setError] = useState('');
  const archived = project?.status === 'archived';
  const activeEmployees = db.employees.filter((e) => e.status === 'active' && e.role === 'employee');
  const stages = stagesFor(db, templateId);

  function save() {
    const input = { name, stageTemplateId: templateId, allocatedHours: Number(allocated), plannedStartDate: start || null, plannedEndDate: end || null };
    if (project) {
      const err = updateProject(project.id, input, adminId);
      if (err) return setError(err);
      const current = getDb().projectAssignments.filter((a) => a.projectId === project.id && a.isActive).map((a) => a.employeeId);
      for (const id of people) if (!current.includes(id)) setAssignment(project.id, id, true, adminId);
      for (const id of current) if (!people.includes(id)) setAssignment(project.id, id, false, adminId);
      toast('Project saved');
    } else {
      const err = createProject(input, people, adminId);
      if (err) return setError(err);
      toast(`Created ${nextProjectCode(db)}`);
    }
    onClose();
  }

  // Report data shown for archived projects (Section 19), computed live from entries.
  const entries = project ? db.workEntries.filter((e) => e.projectId === project.id) : [];
  const byEmployee = new Map<number, number>();
  const byStage = new Map<string, number>();
  for (const e of entries) {
    byEmployee.set(e.employeeId, (byEmployee.get(e.employeeId) ?? 0) + e.hours * 60 + e.minutes);
    const s = stageName(db, e.stageId);
    byStage.set(s, (byStage.get(s) ?? 0) + e.hours * 60 + e.minutes);
  }

  return (
    <Sheet wide title={project ? <><span className="mono">{project.projectCode}</span> {project.name}</> : <>New project <span className="mono muted">{nextProjectCode(db)}</span></>}
      onClose={onClose}
      footer={archived ? <button className="btn" onClick={onClose}>Close</button> : (
        <>
          {project && <ConfirmButton label="Archive project" confirmLabel="Archive — no new entries" danger onConfirm={() => { archiveProject(project.id, adminId); toast(`${project.projectCode} archived`); onClose(); }} />}
          <div className="grow" />
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{project ? 'Save' : 'Create project'}</button>
        </>
      )}>
      {archived ? (
        <>
          <div className="notice">Archived {project?.archivedAt && fmtDay(project.archivedAt.slice(0, 10))}. Removed from employee dropdowns; history stays intact.</div>
          <dl className="kv">
            <dt>Project Allocation</dt><dd className="mono">{project!.allocatedHours}h</dd>
            <dt>Hours Logged</dt><dd className="mono">{(sumMinutes(entries) / 60).toFixed(1)}h</dd>
            <dt>Entries</dt><dd className="mono">{entries.length}</dd>
          </dl>
          <div className="row2">
            <div><div className="step-label">By person</div>{[...byEmployee].map(([id, m]) => <div key={id} className="history-row"><span>{employeeName(db, id)}</span><span className="mono">{(m / 60).toFixed(1)}h</span></div>)}</div>
            <div><div className="step-label">By stage</div>{[...byStage].map(([s, m]) => <div key={s} className="history-row"><span>{s}</span><span className="mono">{(m / 60).toFixed(1)}h</span></div>)}</div>
          </div>
        </>
      ) : (
        <>
          <Field label="Project name" htmlFor="pj-name">
            <input id="pj-name" className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Landing Page Revamp" />
          </Field>
          <div className="row2">
            <Field label="Stage template" htmlFor="pj-tpl" hint={<button className="link-btn" onClick={onEditTemplates}>Manage templates ›</button>}>
              <select id="pj-tpl" className="input" value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))}>
                {db.stageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Project Allocation (hours)" htmlFor="pj-alloc">
              <input id="pj-alloc" className="input mono" inputMode="decimal" value={allocated} onChange={(e) => setAllocated(e.target.value)} placeholder="e.g. 120" />
            </Field>
          </div>
          <div className="stage-preview">{stages.map((s) => <span key={s.id}>{s.stageName}</span>)}</div>
          <div className="row2">
            <Field label="Planned start" htmlFor="pj-s"><input id="pj-s" className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Planned end" htmlFor="pj-e"><input id="pj-e" className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <div className="step-label">Assigned employees</div>
          <div className="chips">
            {activeEmployees.map((e) => {
              const on = people.includes(e.id);
              return <button key={e.id} className={`chip ${on ? 'on' : ''}`} onClick={() => setPeople(on ? people.filter((x) => x !== e.id) : [...people, e.id])}>{on ? '✓ ' : ''}{e.fullName}</button>;
            })}
          </div>
          {error && <div className="notice notice-bad">{error}</div>}
        </>
      )}
    </Sheet>
  );
}

/** Screen A7 — employee × project matrix; one tap assigns or unassigns. */
export function Assignments({ adminId }: { adminId: number }) {
  const db = useDb();
  const projects = db.projects.filter((p) => p.status === 'active');
  const emps = db.employees.filter((e) => e.status === 'active' && e.role === 'employee');
  return (
    <div className="page page-wide">
      <header className="page-head"><div><p className="eyebrow">Admin</p><h1>Assignments</h1></div></header>
      <p className="lede">Employees only see the projects they're assigned to. Unassigning stops future logging; past entries stay.</p>
      <div className="table-wrap">
        <table className="table matrix">
          <thead>
            <tr><th>Employee</th>{projects.map((p) => <th key={p.id} className="center"><span className="mono">{p.projectCode}</span><div className="small muted">{p.name}</div></th>)}</tr>
          </thead>
          <tbody>
            {emps.map((e) => (
              <tr key={e.id}>
                <td className="nowrap"><b>{e.fullName}</b> <span className="mono small muted">{e.employeeCode}</span></td>
                {projects.map((p) => {
                  const on = db.projectAssignments.some((a) => a.projectId === p.id && a.employeeId === e.id && a.isActive);
                  return (
                    <td key={p.id} className="center">
                      <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on}
                        aria-label={`${e.fullName} on ${p.projectCode}`}
                        onClick={() => { setAssignment(p.id, e.id, !on, adminId); toast(`${e.fullName.split(' ')[0]} ${on ? 'unassigned from' : 'assigned to'} ${p.projectCode}`); }}>
                        <span />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
