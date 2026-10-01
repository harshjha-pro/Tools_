import { useState } from 'react';
import { useDb } from '../store';
import type { WorkEntry } from '../types';
import { fmtDayLong, today, weekStart, fmtDateTime } from '../dates';
import {
  adminAttribution, approvedLeaveOn, entriesFor, entryLockStatus, entryTargetLabel, fmtMins, isDateLocked,
  locationName, stageName, sumMinutes, effectiveCutoff,
} from '../logic';
import { copyDay, requestCorrection } from '../actions';
import { Empty, Field, Pill, Sheet, SplitStrip, toast, useNow, colorSlot } from '../ui';
import { AddWork } from './AddWork';

/** Screen E6 — full breakdown of one day; edit if unlocked, Request Correction if locked. */
export function DayDetail({ employeeId, actorId, date, onClose }: {
  employeeId: number; actorId: number; date: string; onClose: () => void;
}) {
  const db = useDb();
  const now = useNow();
  const [editing, setEditing] = useState<WorkEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [correcting, setCorrecting] = useState<WorkEntry | null>(null);
  const isAdmin = actorId !== employeeId;
  const entries = entriesFor(db, employeeId, date);
  const locked = isDateLocked(db, date, now);
  const editable = !locked || isAdmin;
  const leave = approvedLeaveOn(db, employeeId, date);
  const total = sumMinutes(entries);
  const t = today();
  const todayLocked = isDateLocked(db, t, now);
  const todayEmpty = entriesFor(db, employeeId, t).length === 0;

  if (editing) return <AddWork employeeId={employeeId} actorId={actorId} entry={editing} onClose={() => setEditing(null)} />;
  if (adding) return <AddWork employeeId={employeeId} actorId={actorId} date={date} onClose={() => setAdding(false)} />;
  if (correcting) return <CorrectionSheet entry={correcting} actorId={actorId} onClose={() => setCorrecting(null)} />;

  return (
    <Sheet
      title={fmtDayLong(date)}
      onClose={onClose}
      footer={
        <>
          {!isAdmin && date !== t && entries.length > 0 && !todayLocked && todayEmpty && (
            <button className="btn btn-quiet" onClick={() => {
              const err = copyDay(employeeId, date, t, actorId);
              if (err) toast(err, 'bad'); else { toast('Copied to today — adjust as needed'); onClose(); }
            }}>Copy day to today</button>
          )}
          <div className="grow" />
          {editable && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add entry</button>}
        </>
      }
    >
      <div className="day-summary">
        <div>
          <div className="big mono">{fmtMins(total)}</div>
          <div className="muted">logged · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</div>
        </div>
        <div className="day-flags">
          {leave && <Pill tone="leave">Leave{leave.leaveType === 'half_day' ? ` (${leave.halfDaySession?.toUpperCase()})` : ''}</Pill>}
          {locked && <Pill tone="lock">Locked</Pill>}
        </div>
      </div>
      <SplitStrip db={db} entries={entries} />
      {locked && !isAdmin && (
        <div className="notice notice-lock">
          This week locked on {fmtDateTime(effectiveCutoff(db, weekStart(date)).toISOString())}. Use Request correction to fix a mistake — Admin reviews it.
        </div>
      )}
      {locked && isAdmin && <div className="notice">Week is locked for the employee. As Admin you can still edit; changes are attributed to you.</div>}

      {entries.length === 0 ? (
        <Empty title="No work logged">
          {leave ? 'This day is marked as leave.' : editable ? 'Add what you worked on — it takes under a minute.' : 'Nothing was logged for this day.'}
        </Empty>
      ) : (
        <ul className="entry-list">
          {entries.map((e) => {
            const status = entryLockStatus(db, e, now);
            const attribution = adminAttribution(db, e);
            return (
              <li key={e.id} className="entry">
                <span className={`entry-bar bg-${colorSlot(e)}`} />
                <div className="entry-main">
                  <div className="entry-title">{entryTargetLabel(db, e)}</div>
                  <div className="entry-meta">
                    {e.stageId ? <span>{stageName(db, e.stageId)}</span> : <span>Internal</span>}
                    <span>{locationName(db, e.locationId)}</span>
                  </div>
                  {e.description && <div className="entry-desc">{e.description}</div>}
                  {e.deliverable && <div className="entry-deliv">→ {e.deliverable}</div>}
                  {attribution && <div className="entry-attr">{attribution}</div>}
                  {status === 'correction_pending' && <Pill tone="warn">Correction pending</Pill>}
                </div>
                <div className="entry-side">
                  <div className="mono entry-hrs">{fmtMins(e.hours * 60 + e.minutes)}</div>
                  {editable ? (
                    <button className="link-btn" onClick={() => setEditing(e)}>Edit</button>
                  ) : status === 'locked' ? (
                    <button className="link-btn" onClick={() => setCorrecting(e)}>Request correction</button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

export function CorrectionSheet({ entry, actorId, onClose }: { entry: WorkEntry; actorId: number; onClose: () => void }) {
  const db = useDb();
  const [hours, setHours] = useState(entry.hours);
  const [minutes, setMinutes] = useState(entry.minutes);
  const [description, setDescription] = useState(entry.description);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const history = db.correctionRequests.filter((c) => c.workEntryId === entry.id);
  return (
    <Sheet
      title="Request correction"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <div className="grow" />
          <button className="btn btn-primary" onClick={() => {
            const err = requestCorrection(entry.id, { hours, minutes, description }, reason, actorId);
            if (err) setError(err); else { toast('Sent to Admin for review'); onClose(); }
          }}>Send request</button>
        </>
      }
    >
      <div className="notice">
        <b>{entryTargetLabel(db, entry)}</b> · {fmtDayLong(entry.entryDate)} · currently {fmtMins(entry.hours * 60 + entry.minutes)}
      </div>
      <div className="row2">
        <Field label="Hours" htmlFor="cr-h">
          <select id="cr-h" className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {Array.from({ length: 9 }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Minutes" htmlFor="cr-m">
          <select id="cr-m" className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description" htmlFor="cr-d">
        <input id="cr-d" className="input" maxLength={150} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="What needs fixing?" htmlFor="cr-r">
        <textarea id="cr-r" className="input" rows={3} value={reason} placeholder="e.g. I forgot to add 3 hours to Wednesday" onChange={(e) => setReason(e.target.value)} />
      </Field>
      {history.length > 0 && (
        <div className="history">
          <div className="step-label">Earlier requests</div>
          {history.map((c) => (
            <div key={c.id} className="history-row">
              <Pill tone={c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : 'warn'}>{c.status}</Pill>
              <span>{fmtMins(c.proposed.hours * 60 + c.proposed.minutes)} — {c.reason}</span>
              {c.reviewComment && <span className="muted">Admin: {c.reviewComment}</span>}
            </div>
          ))}
        </div>
      )}
      {error && <div className="notice notice-bad">{error}</div>}
    </Sheet>
  );
}
