import { useMemo, useState } from 'react';
import { useDb } from '../store';
import type { WorkEntry } from '../types';
import { addDays, fmtDay, fmtDayLong, range, today, weekStart, DAY_SHORT, dow } from '../dates';
import {
  activeAssignedProjects, entriesFor, fmtMins, isDateLocked, projectUsedMinutes, stagesFor, sumMinutes, MAX_ENTRY_MINUTES,
} from '../logic';
import { createEntries, deleteEntry, updateEntry } from '../actions';
import { DESCRIPTION_CHIPS } from '../seed';
import { ConfirmButton, Field, Sheet, toast, useNow, colorSlot } from '../ui';

type DateMode = 'today' | 'yesterday' | 'pick' | 'multi';

/**
 * Screen E3 — Project → Stage → Hours → optional description → Save.
 * Also used to edit an existing entry (from Day Detail) and by Admin for any employee.
 */
export function AddWork({ employeeId, actorId, date, entry, onClose }: {
  employeeId: number;
  actorId: number;
  date?: string;
  entry?: WorkEntry;
  onClose: () => void;
}) {
  const db = useDb();
  const now = useNow();
  const t = today();
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const isAdminActor = actorId !== employeeId;
  const editing = !!entry;

  const initialMode: DateMode = editing || (date && date !== t && date !== addDays(t, -1)) ? 'pick' : date === addDays(t, -1) ? 'yesterday' : 'today';
  const [mode, setMode] = useState<DateMode>(initialMode);
  const [picked, setPicked] = useState(entry?.entryDate ?? date ?? t);
  const [multi, setMulti] = useState<string[]>([date ?? t]);
  const [multiWeek, setMultiWeek] = useState(weekStart(date ?? t));

  const [target, setTarget] = useState<string>(
    entry ? (entry.projectId ? `p${entry.projectId}` : `i${entry.internalCategoryId}`) : '',
  );
  const [stageId, setStageId] = useState<number | null>(entry?.stageId ?? null);
  const [hours, setHours] = useState(entry?.hours ?? 0);
  const [minutes, setMinutes] = useState(entry?.minutes ?? 0);
  const [description, setDescription] = useState(entry?.description ?? '');
  const [locationId, setLocationId] = useState(entry?.locationId ?? emp.defaultLocationId);
  const [deliverable, setDeliverable] = useState(entry?.deliverable ?? '');
  const [showDeliverable, setShowDeliverable] = useState(!!entry?.deliverable);
  const [error, setError] = useState('');

  const projects = activeAssignedProjects(db, employeeId);
  // When editing an entry on a project the employee has since been unassigned from, keep it selectable.
  if (entry?.projectId && !projects.some((p) => p.id === entry.projectId)) {
    const p = db.projects.find((x) => x.id === entry.projectId);
    if (p) projects.push(p);
  }
  const categories = db.internalCategories.filter((c) => c.isActive);
  const project = target.startsWith('p') ? db.projects.find((p) => p.id === Number(target.slice(1))) : undefined;
  const categoryId = target.startsWith('i') ? Number(target.slice(1)) : null;
  const stages = project ? stagesFor(db, project.stageTemplateId) : [];
  // A historic entry may point to a since-retired stage; show it so the value isn't silently lost.
  const retiredStage = entry?.stageId && project && !stages.some((s) => s.id === entry.stageId)
    ? db.stageTemplateStages.find((s) => s.id === entry.stageId) : undefined;

  const dates = mode === 'today' ? [t] : mode === 'yesterday' ? [addDays(t, -1)] : mode === 'pick' ? [picked] : [...multi].sort();
  const lockedDates = isAdminActor ? [] : dates.filter((d) => isDateLocked(db, d, now));
  const beforeJoin = dates.filter((d) => d < emp.joinDate);
  const thisMins = hours * 60 + minutes;

  const dayTotalBefore = dates.length === 1
    ? sumMinutes(entriesFor(db, employeeId, dates[0]).filter((e) => e.id !== entry?.id))
    : null;

  const alloc = useMemo(() => {
    if (!project) return null;
    const usedOther = projectUsedMinutes(db, project.id) - (entry?.projectId === project.id ? entry.hours * 60 + entry.minutes : 0);
    const after = usedOther + thisMins * dates.length;
    const allocated = project.allocatedHours * 60;
    return { allocated, usedOther, after, over: after - allocated };
  }, [db, project, entry, thisMins, dates.length]);

  const locations = db.workLocations.filter((l) => l.isActive || l.id === locationId);
  const canEditLocation = emp.locationEditableByEmployee || isAdminActor;

  function chooseTarget(key: string) {
    setTarget(key);
    setStageId(null);
    setError('');
  }

  function save(again: boolean) {
    setError('');
    if (!dates.length) return setError('Pick at least one date.');
    if (lockedDates.length) return setError('That week is locked. Ask Admin to extend the cutoff, or request a correction on an existing entry.');
    const input = {
      projectId: project?.id ?? null,
      internalCategoryId: categoryId,
      stageId: project ? stageId : null,
      hours, minutes,
      description: description.trim(),
      locationId,
      deliverable: deliverable.trim(),
    };
    const err = editing
      ? updateEntry(entry!.id, { ...input, entryDate: dates[0] }, actorId)
      : createEntries(employeeId, dates, input, actorId);
    if (err) return setError(err);
    const label = dates.length === 1 ? fmtDay(dates[0]) : `${dates.length} days`;
    if (alloc && alloc.over > 0) toast(`Saved. Allocation exceeded by ${fmtMins(alloc.over)} on ${project!.projectCode}.`, 'warn');
    else if (dates.length === 1) toast(`Saved · ${fmtMins((dayTotalBefore ?? 0) + thisMins)} logged on ${label}`);
    else toast(`Saved to ${label}`);
    if (again) {
      setTarget('');
      setStageId(null);
      setHours(0);
      setMinutes(0);
      setDescription('');
      setDeliverable('');
      setShowDeliverable(false);
    } else onClose();
  }

  const noProjects = projects.length === 0;

  return (
    <Sheet
      title={editing ? 'Edit entry' : 'Add work'}
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <ConfirmButton label="Delete" confirmLabel="Confirm delete" danger onConfirm={() => {
              const err = deleteEntry(entry!.id, actorId);
              if (err) setError(err); else { toast('Entry deleted'); onClose(); }
            }} />
          ) : (
            <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          )}
          <div className="grow" />
          {!editing && <button className="btn" onClick={() => save(true)}>Save &amp; add another</button>}
          <button className="btn btn-primary" onClick={() => save(false)}>{editing ? 'Save changes' : 'Save'}</button>
        </>
      }
    >
      {isAdminActor && <div className="notice">Logging for <b>{emp.fullName}</b>. Changes are recorded as made by Admin.</div>}

      {/* Date */}
      <section className="step">
        {!editing && (
          <div className="seg" role="tablist" aria-label="Date">
            {([['today', 'Today'], ['yesterday', 'Yesterday'], ['pick', 'Pick date'], ['multi', 'Multiple']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
        )}
        {(mode === 'pick' || editing) && (
          <input id="aw-date" className="input" type="date" value={picked} min={emp.joinDate} onChange={(e) => e.target.value && setPicked(e.target.value)} />
        )}
        {mode === 'multi' && !editing && (
          <div className="multi">
            <div className="multi-nav">
              <button className="icon-btn" onClick={() => setMultiWeek(addDays(multiWeek, -7))} aria-label="Previous week">‹</button>
              <span>Week of {fmtDay(multiWeek)}</span>
              <button className="icon-btn" onClick={() => setMultiWeek(addDays(multiWeek, 7))} aria-label="Next week">›</button>
            </div>
            <div className="multi-days">
              {range(multiWeek, addDays(multiWeek, 6)).map((d) => {
                const locked = !isAdminActor && isDateLocked(db, d, now);
                const on = multi.includes(d);
                return (
                  <button key={d} disabled={locked || d < emp.joinDate}
                    className={`daychip ${on ? 'on' : ''} ${dow(d) % 6 === 0 ? 'wkend' : ''}`}
                    onClick={() => setMulti(on ? multi.filter((x) => x !== d) : [...multi, d])}>
                    <span>{DAY_SHORT[dow(d)]}</span><b>{Number(d.slice(8))}</b>{locked && <i className="lock-ic" aria-label="locked" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="day-context">
          {dates.length === 1 ? (
            <>
              <span>{fmtDayLong(dates[0])}</span>
              <span className="mono">
                {fmtMins(dayTotalBefore ?? 0)} logged{thisMins > 0 && <> → <b>{fmtMins((dayTotalBefore ?? 0) + thisMins)}</b></>}
              </span>
            </>
          ) : (
            <span>{dates.length} days selected</span>
          )}
        </div>
        {lockedDates.length > 0 && <div className="notice notice-lock">This week is locked (past the weekly cutoff). Existing entries can still be corrected from the Calendar.</div>}
        {beforeJoin.length > 0 && <div className="notice notice-bad">That date is before the join date.</div>}
      </section>

      {/* Project */}
      <section className="step">
        <div className="step-label">Project</div>
        {noProjects && (
          <div className="notice">No project allocations yet. You can still log internal work below. If this looks wrong, ask Admin to assign you.</div>
        )}
        <div className="choice-list">
          {projects.map((p) => (
            <button key={p.id} className={`choice ${target === `p${p.id}` ? 'on' : ''}`} onClick={() => chooseTarget(`p${p.id}`)}>
              <span className={`dot bg-${colorSlot({ projectId: p.id })}`} />
              <span className="mono code">{p.projectCode}</span>
              <span className="choice-name">{p.name}</span>
            </button>
          ))}
        </div>
        <div className="step-sublabel">Internal work</div>
        <div className="chips">
          {categories.map((c) => (
            <button key={c.id} className={`chip ${target === `i${c.id}` ? 'on' : ''}`} onClick={() => chooseTarget(`i${c.id}`)}>{c.name}</button>
          ))}
        </div>
        {alloc && (
          <div className={`alloc ${alloc.over > 0 ? 'alloc-over' : ''}`}>
            <div><span>Project Allocation</span><b className="mono">{fmtMins(alloc.allocated)}</b></div>
            <div><span>Hours Logged</span><b className="mono">{fmtMins(alloc.usedOther)}</b></div>
            <div><span>Remaining</span><b className="mono">{alloc.allocated - alloc.usedOther >= 0 ? fmtMins(alloc.allocated - alloc.usedOther) : `−${fmtMins(alloc.usedOther - alloc.allocated)}`}</b></div>
            {alloc.over > 0 && thisMins > 0 && <p className="alloc-msg">Allocation exceeded by {fmtMins(alloc.over)}. You can still save — this is just a heads-up.</p>}
          </div>
        )}
      </section>

      {/* Stage */}
      {project && (
        <section className="step">
          <div className="step-label">Stage</div>
          <div className="chips">
            {retiredStage && (
              <button className={`chip ${stageId === retiredStage.id ? 'on' : ''}`} onClick={() => setStageId(retiredStage.id)}>{retiredStage.stageName} (retired)</button>
            )}
            {stages.map((s) => (
              <button key={s.id} className={`chip ${stageId === s.id ? 'on' : ''}`} onClick={() => setStageId(s.id)}>{s.stageName}</button>
            ))}
          </div>
        </section>
      )}

      {/* Hours */}
      <section className="step">
        <div className="step-label">Time</div>
        <div className="time-row">
          <div className="stepper" aria-label="Hours">
            <button onClick={() => setHours(Math.max(0, hours - 1))} aria-label="One hour less">−</button>
            <output className="mono">{hours}<small>h</small></output>
            <button onClick={() => setHours(Math.min(8, hours + 1))} aria-label="One hour more">+</button>
          </div>
          <div className="seg seg-mins" role="radiogroup" aria-label="Minutes">
            {[0, 15, 30, 45].map((m) => (
              <button key={m} role="radio" aria-checked={minutes === m} className={minutes === m ? 'on' : ''}
                disabled={hours * 60 + m > MAX_ENTRY_MINUTES}
                onClick={() => setMinutes(m)}>{String(m).padStart(2, '0')}<small>m</small></button>
            ))}
          </div>
        </div>
      </section>

      {/* Description */}
      <section className="step">
        <Field label="What did you work on?" htmlFor="aw-desc" hint={<span className="mono">{description.length}/150 · optional</span>}>
          <input id="aw-desc" className="input" maxLength={150} value={description} placeholder="Optional" onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="chips chips-small">
          {DESCRIPTION_CHIPS.map((c) => (
            <button key={c} className="chip" onClick={() => setDescription(description ? `${description}, ${c}` : c)}>{c}</button>
          ))}
        </div>
      </section>

      <section className="step step-inline">
        <Field label="Location" htmlFor="aw-loc" hint={!canEditLocation ? 'Set by Admin' : undefined}>
          <select id="aw-loc" className="input" value={locationId} disabled={!canEditLocation} onChange={(e) => setLocationId(Number(e.target.value))}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        {showDeliverable ? (
          <Field label="Deliverable / output" htmlFor="aw-deliv" hint="Optional — e.g. “Fixed 7 bugs”">
            <input id="aw-deliv" className="input" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} />
          </Field>
        ) : (
          <button className="link-btn" onClick={() => setShowDeliverable(true)}>+ Add deliverable</button>
        )}
      </section>

      {error && <div className="notice notice-bad" role="alert">{error}</div>}
    </Sheet>
  );
}
