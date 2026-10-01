import { useState } from 'react';
import { useDb } from '../store';
import { fmtDay, fmtDateTime } from '../dates';
import { employeeName, entryTargetLabel, fmtMins, approvedLeaveOn } from '../logic';
import { reviewCorrection, reviewLeave } from '../actions';
import { Empty, Pill, toast } from '../ui';
import { LEAVE_TONE, REASON_LABEL, TYPE_LABEL } from '../employee/Me';

type Filter = 'pending' | 'all';

/** Screens A9 (leave) + A10 (correction requests). */
export function Requests({ adminId }: { adminId: number }) {
  const db = useDb();
  const [filter, setFilter] = useState<Filter>('pending');
  const [comments, setComments] = useState<Record<string, string>>({});
  const leaves = db.leaveRequests
    .filter((l) => l.status !== 'cancelled' && (filter === 'all' || l.status === 'pending'))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const corrections = db.correctionRequests
    .filter((c) => filter === 'all' || c.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div><p className="eyebrow">Admin</p><h1>Requests</h1></div>
        <div className="seg seg-inline">
          <button className={filter === 'pending' ? 'on' : ''} onClick={() => setFilter('pending')}>Pending</button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        </div>
      </header>

      <div className="two-col">
        <section className="card">
          <div className="card-head"><h3>Correction requests</h3></div>
          <p className="fine">Fixes to entries in locked weeks. Approving applies the change and re-locks the entry.</p>
          {corrections.length === 0 ? <Empty title="Nothing waiting" /> : (
            <ul className="req-list">
              {corrections.map((c) => {
                const entry = db.workEntries.find((e) => e.id === c.workEntryId);
                const key = `c${c.id}`;
                const earlier = db.correctionRequests.filter((x) => x.workEntryId === c.workEntryId && x.id !== c.id).length;
                return (
                  <li key={c.id}>
                    <div className="req-head">
                      <b>{employeeName(db, c.requestedBy)}</b>
                      <Pill tone={c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : 'warn'}>{c.status}</Pill>
                    </div>
                    {entry ? (
                      <div className="small">
                        {fmtDay(entry.entryDate)} · {entryTargetLabel(db, entry)}<br />
                        <span className="mono">{fmtMins(entry.hours * 60 + entry.minutes)} → <b>{fmtMins(c.proposed.hours * 60 + c.proposed.minutes)}</b></span>
                        {c.proposed.description !== entry.description && <> · “{c.proposed.description}”</>}
                      </div>
                    ) : <div className="small muted">Entry was removed.</div>}
                    <div className="req-reason">“{c.reason}”</div>
                    <div className="small muted">Sent {fmtDateTime(c.createdAt)}{earlier > 0 && ` · ${earlier} earlier request${earlier > 1 ? 's' : ''} for this entry`}</div>
                    {c.reviewComment && <div className="small">Admin: {c.reviewComment}</div>}
                    {c.status === 'pending' && entry && (
                      <div className="req-actions">
                        <input className="input" placeholder="Comment (optional)" value={comments[key] ?? ''} onChange={(e) => setComments({ ...comments, [key]: e.target.value })} />
                        <button className="btn btn-quiet" onClick={() => { reviewCorrection(c.id, false, comments[key] ?? '', adminId); toast('Correction rejected'); }}>Reject</button>
                        <button className="btn btn-primary" onClick={() => { reviewCorrection(c.id, true, comments[key] ?? '', adminId); toast('Correction applied'); }}>Approve</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h3>Leave</h3></div>
          {leaves.length === 0 ? <Empty title="Nothing waiting" /> : (
            <ul className="req-list">
              {leaves.map((l) => {
                const key = `l${l.id}`;
                const clash = l.status === 'pending' && [l.startDate, l.endDate].some((d) => approvedLeaveOn(db, l.employeeId, d));
                return (
                  <li key={l.id}>
                    <div className="req-head"><b>{employeeName(db, l.employeeId)}</b><Pill tone={LEAVE_TONE[l.status]}>{l.status}</Pill></div>
                    <div className="small">
                      {l.startDate === l.endDate ? fmtDay(l.startDate) : `${fmtDay(l.startDate)} – ${fmtDay(l.endDate)}`} · {TYPE_LABEL[l.leaveType]}{l.halfDaySession ? ` (${l.halfDaySession.toUpperCase()})` : ''} · {REASON_LABEL[l.reason]}
                    </div>
                    {l.notes && <div className="req-reason">“{l.notes}”</div>}
                    {clash && <div className="small tone-warn">Overlaps leave that's already approved.</div>}
                    {l.rejectionComment && <div className="small">Admin: {l.rejectionComment}</div>}
                    {l.status === 'pending' && (
                      <div className="req-actions">
                        <input className="input" placeholder="Comment if rejecting" maxLength={250} value={comments[key] ?? ''} onChange={(e) => setComments({ ...comments, [key]: e.target.value })} />
                        <button className="btn btn-quiet" onClick={() => { reviewLeave(l.id, false, comments[key] ?? '', adminId); toast('Leave rejected'); }}>Reject</button>
                        <button className="btn btn-primary" onClick={() => { reviewLeave(l.id, true, '', adminId); toast('Leave approved — shows on their calendar'); }}>Approve</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
