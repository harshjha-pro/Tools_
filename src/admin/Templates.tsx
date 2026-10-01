import { useState } from 'react';
import { useDb } from '../store';
import type { StageTemplate } from '../types';
import { stagesFor } from '../logic';
import { deleteTemplate, saveTemplate } from '../actions';
import { ConfirmButton, Field, Pill, Sheet, toast } from '../ui';

/** Screen A6 — reusable, ordered stage lists per project type. */
export function Templates({ adminId }: { adminId: number }) {
  const db = useDb();
  const [editing, setEditing] = useState<StageTemplate | 'new' | null>(null);
  return (
    <div className="page page-wide">
      <header className="page-head">
        <div><p className="eyebrow">Admin</p><h1>Stage templates</h1></div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ New template</button>
      </header>
      <p className="lede">Each project uses one template. Editing applies to new entries; past entries keep their original stage.</p>
      <div className="tpl-grid">
        {db.stageTemplates.map((t) => {
          const used = db.projects.filter((p) => p.stageTemplateId === t.id && p.status === 'active');
          return (
            <button key={t.id} className="card tpl-card" onClick={() => setEditing(t)}>
              <div className="card-head">
                <h3>{t.name}</h3>
                {t.isDefault && <Pill>Default</Pill>}
              </div>
              <ol className="tpl-stages">{stagesFor(db, t.id).map((s) => <li key={s.id}>{s.stageName}</li>)}</ol>
              <div className="small muted">{used.length ? `Used by ${used.map((p) => p.projectCode).join(', ')}` : 'Not used by an active project'}</div>
            </button>
          );
        })}
      </div>
      {editing && <TemplateSheet template={editing === 'new' ? null : editing} adminId={adminId} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateSheet({ template, adminId, onClose }: { template: StageTemplate | null; adminId: number; onClose: () => void }) {
  const db = useDb();
  const [name, setName] = useState(template?.name ?? '');
  const [stages, setStages] = useState<string[]>(template ? stagesFor(db, template.id).map((s) => s.stageName) : ['']);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
  };
  const add = () => {
    if (!draft.trim()) return;
    setStages([...stages.filter(Boolean), draft.trim()]);
    setDraft('');
  };

  return (
    <Sheet title={template ? `Edit “${template.name}”` : 'New stage template'} onClose={onClose} footer={
      <>
        {template && !template.isDefault && (
          <ConfirmButton label="Delete" confirmLabel="Confirm delete" danger onConfirm={() => {
            const err = deleteTemplate(template.id);
            if (err) setError(err); else { toast('Template deleted'); onClose(); }
          }} />
        )}
        <div className="grow" />
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => {
          const err = saveTemplate(template?.id ?? null, name, stages, adminId);
          if (err) setError(err); else { toast('Template saved'); onClose(); }
        }}>Save</button>
      </>
    }>
      <Field label="Template name" htmlFor="tp-name">
        <input id="tp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Content Marketing" />
      </Field>
      <div className="step-label">Stages, in order</div>
      <ol className="stage-edit">
        {stages.map((s, i) => (
          <li key={i}>
            <span className="mono muted">{i + 1}</span>
            <input className="input" value={s} aria-label={`Stage ${i + 1}`} onChange={(e) => setStages(stages.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
            <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === stages.length - 1} aria-label="Move down">↓</button>
            <button className="icon-btn" onClick={() => setStages(stages.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
          </li>
        ))}
      </ol>
      <div className="add-inline">
        <input className="input" value={draft} placeholder="Add a stage" aria-label="New stage name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}>Add</button>
      </div>
      {template && <p className="fine">Renaming a stage that already has entries retires the old name and adds the new one, so history stays accurate.</p>}
      {error && <div className="notice notice-bad">{error}</div>}
    </Sheet>
  );
}
