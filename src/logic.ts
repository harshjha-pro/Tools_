import type { DB, Employee, LockStatus, Project, ProjectHealth, WorkEntry } from './types';
import { addDays, dow, isWeekend, parse, range, today, weekStart } from './dates';

// ---------- durations ----------

export const entryMinutes = (e: Pick<WorkEntry, 'hours' | 'minutes'>) => e.hours * 60 + e.minutes;

export const sumMinutes = (entries: Pick<WorkEntry, 'hours' | 'minutes'>[]) =>
  entries.reduce((t, e) => t + entryMinutes(e), 0);

/** 390 → "6h 30m", 360 → "6h", 45 → "45m", 0 → "0h" */
export function fmtMins(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h && !m) return '0h';
  if (!m) return `${h}h`;
  if (!h) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Hours as a compact decimal for tables: 390 → "6.5" */
export function fmtHrs(total: number): string {
  const v = total / 60;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
}

/**
 * Parse a week-grid cell. Accepts "2", "2.5", "2:30", "2h30", "2h 30m", "45m".
 * Returns minutes rounded to the nearest 15, or null if unreadable.
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return 0;
  let mins: number;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})?\s*m?$/))) mins = Number(m[1]) * 60 + Number(m[2] ?? 0);
  else if ((m = s.match(/^(\d{1,3})\s*m$/))) mins = Number(m[1]);
  else if ((m = s.match(/^\d*\.?\d+$/))) mins = Number(s) * 60;
  else return null;
  return Math.round(mins / 15) * 15;
}

export const MAX_ENTRY_MINUTES = 8 * 60 + 45; // hours 0–8, minutes 0/15/30/45

export const splitMinutes = (total: number) => ({ hours: Math.floor(total / 60), minutes: total % 60 });

// ---------- weekly lock (spec Section 16, Dev Spec 4.3) ----------

/**
 * The scheduled lock moment for the week starting `ws` (a Monday): the first
 * configured cutoff day on or after that week's Saturday, at the cutoff time.
 * With the default Sunday 4:00 PM, Mon 21 Sep–Sun 27 Sep locks Sun 27 Sep 16:00.
 */
export function scheduledCutoff(db: DB, ws: string): Date {
  const { weeklyCutoffDay, weeklyCutoffTime } = db.orgSettings;
  const offset = 5 + ((weeklyCutoffDay - 6 + 7) % 7);
  const d = parse(addDays(ws, offset));
  const [h, m] = weeklyCutoffTime.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function extensionFor(db: DB, ws: string) {
  return db.weeklyCutoffExtensions.find((x) => x.weekStartDate === ws) ?? null;
}

/** Lock deadline after any Admin extension for that specific week. */
export function effectiveCutoff(db: DB, ws: string): Date {
  const base = scheduledCutoff(db, ws);
  const ext = extensionFor(db, ws);
  if (ext && new Date(ext.extendedUntil) > base) return new Date(ext.extendedUntil);
  return base;
}

export function isDateLocked(db: DB, date: string, now: Date): boolean {
  return now > effectiveCutoff(db, weekStart(date));
}

export function entryLockStatus(db: DB, e: WorkEntry, now: Date): LockStatus {
  if (!isDateLocked(db, e.entryDate, now)) return 'unlocked';
  const pending = db.correctionRequests.some((c) => c.workEntryId === e.id && c.status === 'pending');
  return pending ? 'correction_pending' : 'locked';
}

// ---------- projects ----------

export function projectUsedMinutes(db: DB, projectId: number): number {
  return sumMinutes(db.workEntries.filter((e) => e.projectId === projectId));
}

/** Health per Dev Spec 4.4: <100% On Track, 100–110% At Risk, ≥110% Over Budget, archived → Completed. */
export function projectHealth(db: DB, p: Project): ProjectHealth {
  if (p.status === 'archived') return 'completed';
  const pct = projectUsedMinutes(db, p.id) / 60 / p.allocatedHours;
  if (pct >= 1.1) return 'over_budget';
  if (pct >= 1.0) return 'at_risk';
  return 'on_track';
}

/** Allocation threshold band (Section 7) — a management signal only. */
export function allocationBand(pct: number): { label: string; tone: 'ok' | 'warn' | 'bad' } {
  if (pct >= 1.1) return { label: 'Significant overrun', tone: 'bad' };
  if (pct >= 1.0) return { label: 'Allocation reached', tone: 'bad' };
  if (pct >= 0.85) return { label: 'Approaching allocation', tone: 'warn' };
  return { label: 'Normal', tone: 'ok' };
}

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  over_budget: 'Over Budget',
  completed: 'Completed',
};

export function activeAssignedProjects(db: DB, employeeId: number): Project[] {
  const ids = new Set(
    db.projectAssignments.filter((a) => a.employeeId === employeeId && a.isActive).map((a) => a.projectId),
  );
  return db.projects.filter((p) => ids.has(p.id) && p.status === 'active');
}

export function stagesFor(db: DB, templateId: number, includeInactive = false) {
  return db.stageTemplateStages
    .filter((s) => s.stageTemplateId === templateId && (includeInactive || s.isActive))
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

// ---------- labels ----------

export function entryTargetLabel(db: DB, e: WorkEntry): string {
  if (e.projectId) {
    const p = db.projects.find((x) => x.id === e.projectId);
    return p ? `${p.projectCode} — ${p.name}` : 'Unknown project';
  }
  return db.internalCategories.find((c) => c.id === e.internalCategoryId)?.name ?? 'Internal';
}

export function entryShortLabel(db: DB, e: WorkEntry): string {
  if (e.projectId) return db.projects.find((x) => x.id === e.projectId)?.projectCode ?? '—';
  return db.internalCategories.find((c) => c.id === e.internalCategoryId)?.name ?? 'Internal';
}

export const stageName = (db: DB, id: number | null) =>
  id ? db.stageTemplateStages.find((s) => s.id === id)?.stageName ?? '—' : '';

export const locationName = (db: DB, id: number) => db.workLocations.find((l) => l.id === id)?.name ?? '—';

export const employeeName = (db: DB, id: number) => db.employees.find((e) => e.id === id)?.fullName ?? 'Unknown';

export const firstName = (name: string) => name.split(' ')[0];

/** "Modified by Admin — Priya" attribution (Section 17), or null if the employee last touched it. */
export function adminAttribution(db: DB, e: WorkEntry): string | null {
  if (e.updatedBy === e.employeeId) return null;
  const by = db.employees.find((x) => x.id === e.updatedBy);
  if (!by || by.role !== 'admin') return null;
  return `Modified by Admin — ${firstName(by.fullName)}`;
}

// ---------- leave & day status ----------

export function approvedLeaveOn(db: DB, employeeId: number, date: string) {
  return db.leaveRequests.find(
    (l) => l.employeeId === employeeId && l.status === 'approved' && l.startDate <= date && l.endDate >= date,
  );
}

export type DayStatus = 'logged' | 'missing' | 'leave' | 'future' | 'weekend' | 'before-join' | 'today-empty';

export function dayStatus(db: DB, emp: Employee, date: string): DayStatus {
  const t = today();
  if (date < emp.joinDate) return 'before-join';
  if (approvedLeaveOn(db, emp.id, date)) return 'leave';
  const has = db.workEntries.some((e) => e.employeeId === emp.id && e.entryDate === date);
  if (has) return 'logged';
  if (date > t) return 'future';
  if (isWeekend(date)) return 'weekend';
  if (date === t) return 'today-empty';
  return 'missing';
}

/** Past weekdays this week with nothing logged and no leave (Section 27). */
export function missingDaysThisWeek(db: DB, emp: Employee): string[] {
  const t = today();
  const ws = weekStart(t);
  return range(ws, addDays(t, -1)).filter((d) => dow(d) >= 1 && dow(d) <= 5 && dayStatus(db, emp, d) === 'missing');
}

export function entriesFor(db: DB, employeeId: number, date: string) {
  return db.workEntries
    .filter((e) => e.employeeId === employeeId && e.entryDate === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
