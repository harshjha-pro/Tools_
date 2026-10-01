import { useState } from 'react';
import { useDb } from '../store';
import type { LeaveReason, LeaveType } from '../types';
import { fmtDay, fmtDateTime, today } from '../dates';
import { applyLeave, cancelLeave, updateEmployee } from '../actions';
import { Empty, Field, Pill, Sheet, toast } from '../ui';

const TYPE_LABEL: Record<LeaveType, string> = { full_day: 'Full day', half_day: 'Half day', multiple_days: 'Multiple days' };
const REASON_LABEL: Record<LeaveReason, string> = { personal: 'Personal', sick: 'Sick', holiday: 'Holiday', other: 'Other' };
export const LEAVE_TONE = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' } as const;
export { TYPE_LABEL, REASON_LABEL };

/** Screens E15 (profile) + E7/E8 (leave), grouped under one tab to keep navigation short. */
export function Me({ employeeId, onLogout }: { employeeId: number; onLogout: () => void }) {
  const db = useDb();
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const [applying, setApplying] = useState(false);
  const leaves = db.leaveRequests.filter((l) => l.employeeId === employeeId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Profile</p>
          <h1>{emp.fullName}</h1>
        </div>
      </header>

      <section className="card">
        <dl className="kv">
          <dt>Employee ID</dt><dd className="mono">{emp.employeeCode}</dd>
          <dt>Login</dt><dd>{emp.loginEmail}</dd>
          <dt>Joined</dt><dd>{fmtDay(emp.joinDate)}</dd>
        </dl>
        <Field label="Default work location" htmlFor="me-loc" hint={emp.locationEditableByEmployee ? 'Used to pre-fill new entries.' : 'Set by Admin'}>
          <select id="me-loc" className="input" value={emp.defaultLocationId} disabled={!emp.locationEditableByEmployee}
            onChange={(e) => { updateEmployee(emp.id, { defaultLocationId: Number(e.target.value) }); toast('Default location saved'); }}>
            {db.workLocations.filter((l) => l.isActive || l.id === emp.defaultLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Leave</h3>
          <button className="btn btn-sm" onClick={() => setApplying(true)}>Apply for leave</button>
        </div>
        {leaves.length === 0 ? (
          <Empty title="No leave requests yet" />
        ) : (
          <ul className="leave-list">
            {leaves.map((l) => (
              <li key={l.id}>
                <div>
                  <b>{l.startDate === l.endDate ? fmtDay(l.startDate) : `${fmtDay(l.startDate)} – ${fmtDay(l.endDate)}`}</b>
                  <div className="muted small">{TYPE_LABEL[l.leaveType]}{l.halfDaySession ? ` (${l.halfDaySession.toUpperCase()})` : ''} · {REASON_LABEL[l.reason]} · submitted {fmtDateTime(l.submittedAt)}</div>
                  {l.status === 'rejected' && l.rejectionComment && <div className="small tone-bad">Admin: {l.rejectionComment}</div>}
                </div>
                <div className="leave-side">
                  <Pill tone={LEAVE_TONE[l.status]}>{l.status}</Pill>
                  {l.status === 'pending' && <button className="link-btn" onClick={() => { cancelLeave(l.id); toast('Request cancelled'); }}>Cancel</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn btn-quiet" onClick={onLogout}>Log out</button>
      {applying && <ApplyLeave employeeId={employeeId} onClose={() => setApplying(false)} />}
    </div>
  );
}

function ApplyLeave({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const db = useDb();
  const [type, setType] = useState<LeaveType>('full_day');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [session, setSession] = useState<'am' | 'pm'>('am');
  const [reason, setReason] = useState<LeaveReason>('personal');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const endDate = type === 'multiple_days' ? end : start;
  const overlapsWork = db.workEntries.some((e) => e.employeeId === employeeId && e.entryDate >= start && e.entryDate <= endDate);

  return (
    <Sheet title="Apply for leave" onClose={onClose} footer={
      <>
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => {
          const err = applyLeave({
            employeeId, leaveType: type, startDate: start, endDate, halfDaySession: type === 'half_day' ? session : null, reason, notes,
          });
          if (err) setError(err); else { toast('Leave request sent to Admin'); onClose(); }
        }}>Submit request</button>
      </>
    }>
      <div className="seg">
        {(Object.keys(TYPE_LABEL) as LeaveType[]).map((k) => (
          <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{TYPE_LABEL[k]}</button>
        ))}
      </div>
      <div className="row2">
        <Field label={type === 'multiple_days' ? 'From' : 'Date'} htmlFor="lv-s">
          <input id="lv-s" className="input" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
        </Field>
        {type === 'multiple_days' && (
          <Field label="To" htmlFor="lv-e">
            <input id="lv-e" className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        )}
        {type === 'half_day' && (
          <Field label="Session" htmlFor="lv-ss">
            <select id="lv-ss" className="input" value={session} onChange={(e) => setSession(e.target.value as 'am' | 'pm')}>
              <option value="am">AM</option><option value="pm">PM</option>
            </select>
          </Field>
        )}
      </div>
      <Field label="Reason" htmlFor="lv-r">
        <select id="lv-r" className="input" value={reason} onChange={(e) => setReason(e.target.value as LeaveReason)}>
          {(Object.keys(REASON_LABEL) as LeaveReason[]).map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="Notes" htmlFor="lv-n" hint={reason === 'other' ? 'Required when the reason is Other' : 'Optional'}>
        <input id="lv-n" className="input" maxLength={250} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {overlapsWork && <div className="notice">You already logged work on these dates. You can still submit.</div>}
      {error && <div className="notice notice-bad">{error}</div>}
    </Sheet>
  );
}
