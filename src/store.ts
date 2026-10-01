import { useSyncExternalStore } from 'react';
import { produce, type Draft } from 'immer';
import type { AuditLogRow, DB, WorkEntry } from './types';
import { buildSeed } from './seed';

// A tiny client-side store standing in for the backend. State persists to
// localStorage so testers keep their data across reloads, and other open tabs
// pick up changes through the `storage` event.

const DB_KEY = 'dwt.db.v1';
const SESSION_KEY = 'dwt.session.v1';
const SCHEMA_VERSION = 1;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private window, sandbox) — keep working in memory */
  }
}

function loadDb(): DB {
  const raw = safeGet(DB_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === SCHEMA_VERSION) return parsed;
    } catch {
      /* fall through to a fresh seed */
    }
  }
  return buildSeed();
}

let db: DB = loadDb();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (ev) => {
    if (ev.key === DB_KEY && ev.newValue) {
      try {
        db = JSON.parse(ev.newValue);
        emit();
      } catch {
        /* ignore malformed */
      }
    }
    if (ev.key === SESSION_KEY) {
      session = loadSession();
      emit();
    }
  });
}

export function useDb(): DB {
  return useSyncExternalStore(subscribe, () => db);
}

export function getDb(): DB {
  return db;
}

export function update(recipe: (d: Draft<DB>) => void) {
  db = produce(db, recipe);
  safeSet(DB_KEY, JSON.stringify(db));
  emit();
}

export function resetDemoData() {
  db = buildSeed();
  safeSet(DB_KEY, JSON.stringify(db));
  emit();
}

export function nextId(d: Draft<DB>): number {
  d.seq += 1;
  return d.seq;
}

export const nowIso = () => new Date().toISOString();

export function audit(
  d: Draft<DB>,
  row: Omit<AuditLogRow, 'id' | 'performedAt' | 'notes' | 'fieldName' | 'oldValue' | 'newValue'> &
    Partial<Pick<AuditLogRow, 'notes' | 'fieldName' | 'oldValue' | 'newValue'>>,
) {
  d.auditLog.push({
    id: nextId(d),
    performedAt: nowIso(),
    notes: '',
    fieldName: null,
    oldValue: null,
    newValue: null,
    ...row,
  });
}

/** Write field-level audit rows for whatever changed on a work entry. */
export function auditEntryChanges(d: Draft<DB>, before: WorkEntry, after: Partial<WorkEntry>, by: number, notes = '') {
  const fields: (keyof WorkEntry)[] = [
    'employeeId', 'entryDate', 'projectId', 'internalCategoryId', 'stageId',
    'hours', 'minutes', 'description', 'locationId', 'deliverable',
  ];
  for (const f of fields) {
    if (f in after && after[f] !== before[f]) {
      audit(d, {
        entityType: 'work_entry',
        entityId: before.id,
        action: 'update',
        performedBy: by,
        fieldName: f,
        oldValue: String(before[f] ?? ''),
        newValue: String(after[f] ?? ''),
        notes,
      });
    }
  }
}

// ---------- session (who is logged in, which view) ----------

export interface Session {
  employeeId: number | null;
  view: 'employee' | 'admin';
}

function loadSession(): Session {
  try {
    const raw = safeGet(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { employeeId: null, view: 'employee' };
}

let session: Session = loadSession();

export function useSession(): Session {
  return useSyncExternalStore(subscribe, () => session);
}

export function setSession(next: Partial<Session>) {
  session = { ...session, ...next };
  safeSet(SESSION_KEY, JSON.stringify(session));
  emit();
}
