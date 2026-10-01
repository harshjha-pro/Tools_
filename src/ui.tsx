import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DB, WorkEntry } from './types';

/** Re-render every 30s so lock states flip at the cutoff without a reload. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Sheet({ title, onClose, children, footer, wide }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? 'sheet-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- toasts ----------

type Toast = { id: number; text: string; tone: 'ok' | 'warn' | 'bad' };
let toastSeq = 0;
let pushToast: (t: Toast) => void = () => {};

export function toast(text: string, tone: Toast['tone'] = 'ok') {
  pushToast({ id: ++toastSeq, text, tone });
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      setItems((xs) => [...xs.slice(-1), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3000);
    };
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>
      ))}
    </div>
  );
}

/** Two-step button: browsers inside sandboxes can't show confirm(), so confirm inline. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn btn-quiet', danger }: {
  label: string; confirmLabel: string; onConfirm: () => void; className?: string; danger?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!armed)
    return (
      <button className={className} onClick={() => { setArmed(true); timer.current = window.setTimeout(() => setArmed(false), 4000); }}>
        {label}
      </button>
    );
  return (
    <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { setArmed(false); onConfirm(); }}>
      {confirmLabel}
    </button>
  );
}

export function Pill({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

/** Stable per-project colour slot (1–6); internal work uses the neutral slot. */
export function colorSlot(e: Pick<WorkEntry, 'projectId'> | { projectId: number | null }): string {
  return e.projectId ? `c${(e.projectId % 6) + 1}` : 'c0';
}

/**
 * Proportional strip of how a day's time was split across projects.
 * Width is relative to that day's own total — there is no target line.
 */
export function SplitStrip({ db, entries }: { db: DB; entries: WorkEntry[] }) {
  const total = entries.reduce((t, e) => t + e.hours * 60 + e.minutes, 0);
  if (!total) return null;
  const byKey = new Map<string, { mins: number; slot: string; label: string }>();
  for (const e of entries) {
    const key = e.projectId ? `p${e.projectId}` : `i${e.internalCategoryId}`;
    const label = e.projectId
      ? db.projects.find((p) => p.id === e.projectId)?.projectCode ?? ''
      : db.internalCategories.find((c) => c.id === e.internalCategoryId)?.name ?? '';
    const cur = byKey.get(key) ?? { mins: 0, slot: colorSlot(e), label };
    cur.mins += e.hours * 60 + e.minutes;
    byKey.set(key, cur);
  }
  return (
    <div className="strip" aria-hidden="true">
      {[...byKey.values()].map((s, i) => (
        <span key={i} className={`strip-seg bg-${s.slot}`} style={{ flexGrow: s.mins }} title={s.label} />
      ))}
    </div>
  );
}
