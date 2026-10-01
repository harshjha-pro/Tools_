import type { Draft } from 'immer';
import type { DB, Employee, LeaveRequest, WorkEntry } from './types';
import { audit, auditEntryChanges, getDb, nextId, nowIso, update } from './store';
import { isDateLocked, stagesFor } from './logic';
import { addDays, weekStart } from './dates';

// Each action validates against current state and returns an error string,
// or null on success. Admin edits are never gated by lock state (Section 17).

export type EntryInput = Pick<
  WorkEntry,
  'entryDate' | 'projectId' | 'internalCategoryId' | 'stageId' | 'hours' | 'minutes' | 'description' | 'locationId' | 'deliverable'
>;

function validateEntry(input: EntryInput): string | null {
  if (!input.projectId && !input.internalCategoryId) return 'Choose a project or an internal category.';
  if (input.projectId && !input.stageId) return 'Choose a stage.';
  if (input.hours < 0 || input.hours > 8) return 'Hours must be between 0 and 8.';
  if (![0, 15, 30, 45].includes(input.minutes)) return 'Minutes must be 0, 15, 30 or 45.';
  if (input.hours === 0 && input.minutes === 0) return 'Add some time before saving.';
  if (input.description.length > 150) return 'Keep the description under 150 characters.';
  return null;
}

export function createEntries(employeeId: number, dates: string[], input: Omit<EntryInput, 'entryDate'>, actorId: number) {
  const err = validateEntry({ ...input, entryDate: dates[0] ?? '' });
  if (err) return err;
  const db = getDb();
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const actorIsAdmin = db.employees.find((e) => e.id === actorId)?.role === 'admin' && actorId !== employeeId;
  const now = new Date();
  for (const d of dates) {
    if (d < emp.joinDate) return `You can't log work before your join date.`;
    if (!actorIsAdmin && isDateLocked(db, d, now)) return `The week of ${d} is locked.`;
  }
  update((draft) => {
    for (const d of dates) {
      const id = nextId(draft);
      const ts = nowIso();
      draft.workEntries.push({ id, employeeId, entryDate: d, ...input, createdBy: actorId, createdAt: ts, updatedBy: actorId, updatedAt: ts });
      audit(draft, { entityType: 'work_entry', entityId: id, action: 'create', performedBy: actorId });
    }
  });
  return null;
}

export function updateEntry(entryId: number, patch: Partial<WorkEntry>, actorId: number, notes = '') {
  const db = getDb();
  const before = db.workEntries.find((e) => e.id === entryId);
  if (!before) return 'Entry not found.';
  const merged = { ...before, ...patch };
  const err = validateEntry(merged);
  if (err) return err;
  const actor = db.employees.find((e) => e.id === actorId);
  if (actor?.role !== 'admin' && isDateLocked(db, before.entryDate, new Date())) return 'This week is locked. Request a correction instead.';
  update((d) => {
    const e = d.workEntries.find((x) => x.id === entryId)!;
    auditEntryChanges(d, before, patch, actorId, notes);
    Object.assign(e, patch, { updatedBy: actorId, updatedAt: nowIso() });
  });
  return null;
}

export function deleteEntry(entryId: number, actorId: number) {
  const db = getDb();
  const e = db.workEntries.find((x) => x.id === entryId);
  if (!e) return 'Entry not found.';
  const actor = db.employees.find((x) => x.id === actorId);
  if (actor?.role !== 'admin' && isDateLocked(db, e.entryDate, new Date())) return 'This week is locked.';
  update((d) => {
    d.workEntries = d.workEntries.filter((x) => x.id !== entryId);
    audit(d, { entityType: 'work_entry', entityId: entryId, action: 'delete', performedBy: actorId });
  });
  return null;
}

/** Copy every entry from one day to another (Copy Day, Section 12). */
export function copyDay(employeeId: number, from: string, to: string, actorId: number) {
  const db = getDb();
  if (isDateLocked(db, to, new Date())) return 'That day is locked.';
  const src = db.workEntries.filter((e) => e.employeeId === employeeId && e.entryDate === from);
  if (!src.length) return 'Nothing to copy from that day.';
  const active = new Set(
    db.projectAssignments.filter((a) => a.employeeId === employeeId && a.isActive).map((a) => a.projectId),
  );
  update((d) => {
    for (const s of src) {
      if (s.projectId && !active.has(s.projectId)) continue;
      const id = nextId(d);
      const ts = nowIso();
      d.workEntries.push({ ...s, id, entryDate: to, createdBy: actorId, createdAt: ts, updatedBy: actorId, updatedAt: ts });
      audit(d, { entityType: 'work_entry', entityId: id, action: 'create', performedBy: actorId, notes: `Copied from ${from}` });
    }
  });
  return null;
}

// ---------- corrections ----------

export function requestCorrection(entryId: number, proposed: { hours: number; minutes: number; description: string }, reason: string, actorId: number) {
  if (!reason.trim()) return 'Tell Admin what needs fixing.';
  if (proposed.hours === 0 && proposed.minutes === 0) return 'Proposed time must be more than zero.';
  update((d) => {
    const id = nextId(d);
    d.correctionRequests.push({
      id, workEntryId: entryId, requestedBy: actorId, proposed, reason: reason.trim(), status: 'pending',
      reviewedBy: null, reviewedAt: null, reviewComment: '', createdAt: nowIso(),
    });
    audit(d, { entityType: 'work_entry', entityId: entryId, action: 'status_change', performedBy: actorId, newValue: 'correction_pending' });
  });
  return null;
}

export function reviewCorrection(id: number, approve: boolean, comment: string, adminId: number) {
  const db = getDb();
  const c = db.correctionRequests.find((x) => x.id === id);
  if (!c) return 'Request not found.';
  const entry = db.workEntries.find((e) => e.id === c.workEntryId);
  update((d) => {
    const cr = d.correctionRequests.find((x) => x.id === id)!;
    cr.status = approve ? 'approved' : 'rejected';
    cr.reviewedBy = adminId;
    cr.reviewedAt = nowIso();
    cr.reviewComment = comment;
    if (approve && entry) {
      const e = d.workEntries.find((x) => x.id === entry.id)!;
      audit(d, { entityType: 'work_entry', entityId: e.id, action: 'unlock', performedBy: adminId, notes: `Correction #${id}` });
      auditEntryChanges(d, entry, c.proposed, adminId, `Correction #${id} approved`);
      Object.assign(e, c.proposed, { updatedBy: adminId, updatedAt: nowIso() });
      audit(d, { entityType: 'work_entry', entityId: e.id, action: 'lock', performedBy: adminId });
    }
  });
  return null;
}

// ---------- leave ----------

export function applyLeave(input: Omit<LeaveRequest, 'id' | 'status' | 'submittedAt' | 'reviewedBy' | 'reviewedAt' | 'rejectionComment'>) {
  if (input.endDate < input.startDate) return 'End date must be on or after the start date.';
  if (input.reason === 'other' && !input.notes.trim()) return 'Add a note when the reason is Other.';
  const db = getDb();
  const clash = db.leaveRequests.find(
    (l) => l.employeeId === input.employeeId && (l.status === 'pending' || l.status === 'approved') &&
      l.startDate <= input.endDate && l.endDate >= input.startDate,
  );
  if (clash) return 'These dates overlap a leave request you already have.';
  update((d) => {
    d.leaveRequests.push({ ...input, id: nextId(d), status: 'pending', submittedAt: nowIso(), reviewedBy: null, reviewedAt: null, rejectionComment: '' });
  });
  return null;
}

export function cancelLeave(id: number) {
  update((d) => {
    const l = d.leaveRequests.find((x) => x.id === id);
    if (l && l.status === 'pending') l.status = 'cancelled';
  });
}

export function reviewLeave(id: number, approve: boolean, comment: string, adminId: number) {
  update((d) => {
    const l = d.leaveRequests.find((x) => x.id === id)!;
    l.status = approve ? 'approved' : 'rejected';
    l.reviewedBy = adminId;
    l.reviewedAt = nowIso();
    l.rejectionComment = approve ? '' : comment;
    audit(d, { entityType: 'leave_request', entityId: id, action: 'status_change', performedBy: adminId, newValue: l.status });
  });
}

// ---------- projects ----------

export interface ProjectInput {
  name: string;
  stageTemplateId: number;
  allocatedHours: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}

function validateProject(p: ProjectInput) {
  if (!p.name.trim()) return 'Project name is required.';
  if (p.name.length > 100) return 'Keep the project name under 100 characters.';
  if (!(p.allocatedHours > 0)) return 'Project Allocation must be more than 0 hours.';
  if (p.plannedStartDate && p.plannedEndDate && p.plannedEndDate < p.plannedStartDate) return 'Planned end must be on or after planned start.';
  return null;
}

export function nextProjectCode(db: DB) {
  const max = db.projects.reduce((m, p) => Math.max(m, Number(p.projectCode.replace(/\D/g, '')) || 0), 0);
  return `DF-${String(max + 1).padStart(3, '0')}`;
}

export function createProject(input: ProjectInput, employeeIds: number[], adminId: number) {
  const err = validateProject(input);
  if (err) return err;
  update((d) => {
    const id = nextId(d);
    d.projects.push({
      id, projectCode: nextProjectCode(d as DB), ...input, name: input.name.trim(),
      status: 'active', archivedAt: null, createdAt: nowIso(),
    });
    audit(d, { entityType: 'project', entityId: id, action: 'create', performedBy: adminId });
    for (const eid of employeeIds) assignDraft(d, id, eid, adminId);
  });
  return null;
}

export function updateProject(id: number, input: ProjectInput, adminId: number) {
  const err = validateProject(input);
  if (err) return err;
  update((d) => {
    const p = d.projects.find((x) => x.id === id)!;
    for (const k of Object.keys(input) as (keyof ProjectInput)[]) {
      if (p[k] !== input[k]) {
        audit(d, { entityType: 'project', entityId: id, action: 'update', performedBy: adminId, fieldName: k, oldValue: String(p[k]), newValue: String(input[k]) });
      }
    }
    Object.assign(p, input, { name: input.name.trim() });
  });
  return null;
}

export function archiveProject(id: number, adminId: number) {
  update((d) => {
    const p = d.projects.find((x) => x.id === id)!;
    p.status = 'archived';
    p.archivedAt = nowIso();
    audit(d, { entityType: 'project', entityId: id, action: 'status_change', performedBy: adminId, newValue: 'archived' });
  });
}

// ---------- assignments ----------

function assignDraft(d: Draft<DB>, projectId: number, employeeId: number, adminId: number) {
  if (d.projectAssignments.some((a) => a.projectId === projectId && a.employeeId === employeeId && a.isActive)) return;
  d.projectAssignments.push({
    id: nextId(d), projectId, employeeId, assignedAt: nowIso(), assignedBy: adminId, unassignedAt: null, isActive: true,
  });
}

export function setAssignment(projectId: number, employeeId: number, on: boolean, adminId: number) {
  update((d) => {
    if (on) assignDraft(d, projectId, employeeId, adminId);
    else {
      // Deactivate rather than delete: past entries stay intact, only future logging stops.
      const a = d.projectAssignments.find((x) => x.projectId === projectId && x.employeeId === employeeId && x.isActive);
      if (a) {
        a.isActive = false;
        a.unassignedAt = nowIso();
      }
    }
  });
}

// ---------- stage templates ----------

export function saveTemplate(templateId: number | null, name: string, stageNames: string[], adminId: number) {
  const clean = stageNames.map((s) => s.trim()).filter(Boolean);
  if (!name.trim()) return 'Template name is required.';
  if (!clean.length) return 'Add at least one stage.';
  if (new Set(clean.map((s) => s.toLowerCase())).size !== clean.length) return 'Stage names must be unique within a template.';
  const db = getDb();
  if (db.stageTemplates.some((t) => t.id !== templateId && t.name.toLowerCase() === name.trim().toLowerCase())) return 'A template with that name already exists.';
  update((d) => {
    let tid = templateId;
    if (tid === null) {
      tid = nextId(d);
      d.stageTemplates.push({ id: tid, name: name.trim(), isDefault: false, createdAt: nowIso() });
      audit(d, { entityType: 'stage_template', entityId: tid, action: 'create', performedBy: adminId });
    } else {
      d.stageTemplates.find((t) => t.id === tid)!.name = name.trim();
    }
    const existing = d.stageTemplateStages.filter((s) => s.stageTemplateId === tid);
    const used = new Set(d.workEntries.map((e) => e.stageId));
    // Stages no longer in the list: retire them if entries reference them, otherwise remove.
    for (const s of existing) {
      if (!clean.some((n) => n.toLowerCase() === s.stageName.toLowerCase())) {
        if (used.has(s.id)) s.isActive = false;
        else d.stageTemplateStages = d.stageTemplateStages.filter((x) => x.id !== s.id);
      }
    }
    // Upsert in the new order. Inactive rows keep a high sequence so they never collide.
    clean.forEach((n, i) => {
      const s = d.stageTemplateStages.find((x) => x.stageTemplateId === tid && x.stageName.toLowerCase() === n.toLowerCase());
      if (s) {
        s.isActive = true;
        s.sequenceOrder = i + 1;
      } else {
        d.stageTemplateStages.push({ id: nextId(d), stageTemplateId: tid!, stageName: n, sequenceOrder: i + 1, isActive: true });
      }
    });
    let extra = clean.length;
    for (const s of d.stageTemplateStages) if (s.stageTemplateId === tid && !s.isActive) s.sequenceOrder = 100 + ++extra;
  });
  return null;
}

export function deleteTemplate(templateId: number) {
  const db = getDb();
  const users = db.projects.filter((p) => p.stageTemplateId === templateId && p.status === 'active');
  if (users.length) return `Used by ${users.map((p) => p.projectCode).join(', ')}. Move those projects to another template first.`;
  if (db.projects.some((p) => p.stageTemplateId === templateId)) return 'Archived projects still reference this template, so it is kept for their history.';
  if (db.stageTemplates.find((t) => t.id === templateId)?.isDefault) return 'The default template cannot be deleted.';
  update((d) => {
    d.stageTemplates = d.stageTemplates.filter((t) => t.id !== templateId);
    d.stageTemplateStages = d.stageTemplateStages.filter((s) => s.stageTemplateId !== templateId);
  });
  return null;
}

export function templateHasStages(db: DB, templateId: number) {
  return stagesFor(db, templateId).length > 0;
}

// ---------- employees ----------

export function nextEmployeeCode(db: DB) {
  const max = db.employees.reduce((m, e) => Math.max(m, Number(e.employeeCode.replace(/\D/g, '')) || 0), 0);
  return `EMP-${String(max + 1).padStart(3, '0')}`;
}

export function createEmployee(input: Pick<Employee, 'fullName' | 'loginEmail' | 'role' | 'defaultLocationId' | 'locationEditableByEmployee' | 'joinDate'>, adminId: number) {
  if (!input.fullName.trim()) return 'Name is required.';
  if (!/^\S+@\S+\.\S+$/.test(input.loginEmail.trim())) return 'Enter a valid email.';
  const db = getDb();
  if (db.employees.some((e) => e.loginEmail.toLowerCase() === input.loginEmail.trim().toLowerCase())) return 'That email is already in use.';
  update((d) => {
    const id = nextId(d);
    d.employees.push({
      id, employeeCode: nextEmployeeCode(d as DB), ...input, fullName: input.fullName.trim(),
      loginEmail: input.loginEmail.trim().toLowerCase(), status: 'active', offboardedAt: null,
    });
    audit(d, { entityType: 'employee', entityId: id, action: 'create', performedBy: adminId });
  });
  return null;
}

export function updateEmployee(id: number, patch: Partial<Pick<Employee, 'fullName' | 'defaultLocationId' | 'locationEditableByEmployee'>>) {
  update((d) => {
    Object.assign(d.employees.find((e) => e.id === id)!, patch);
  });
}

export function offboardEmployee(id: number, adminId: number) {
  update((d) => {
    const e = d.employees.find((x) => x.id === id)!;
    e.status = 'offboarded';
    e.offboardedAt = nowIso();
    for (const a of d.projectAssignments) if (a.employeeId === id && a.isActive) { a.isActive = false; a.unassignedAt = nowIso(); }
    audit(d, { entityType: 'employee', entityId: id, action: 'status_change', performedBy: adminId, newValue: 'offboarded' });
  });
}

// ---------- settings ----------

export function saveCutoff(day: number, time: string) {
  update((d) => {
    d.orgSettings.weeklyCutoffDay = day;
    d.orgSettings.weeklyCutoffTime = time;
  });
}

export function extendCutoff(weekStartDate: string, extendedUntil: string, reason: string, adminId: number) {
  if (new Date(extendedUntil) <= new Date()) return 'Pick a time in the future.';
  update((d) => {
    const existing = d.weeklyCutoffExtensions.find((x) => x.weekStartDate === weekStartDate);
    if (existing) Object.assign(existing, { extendedUntil, reason, extendedBy: adminId });
    else d.weeklyCutoffExtensions.push({ id: nextId(d), weekStartDate, extendedUntil, reason, extendedBy: adminId, createdAt: nowIso() });
  });
  return null;
}

export function endExtension(weekStartDate: string) {
  update((d) => {
    d.weeklyCutoffExtensions = d.weeklyCutoffExtensions.filter((x) => x.weekStartDate !== weekStartDate);
  });
}

export function addLocation(name: string) {
  const n = name.trim();
  if (!n) return 'Enter a name.';
  if (getDb().workLocations.some((l) => l.name.toLowerCase() === n.toLowerCase())) return 'That location already exists.';
  update((d) => {
    d.workLocations.push({ id: nextId(d), name: n, isActive: true });
  });
  return null;
}

export function toggleLocation(id: number) {
  const db = getDb();
  const loc = db.workLocations.find((l) => l.id === id)!;
  if (loc.isActive && db.workLocations.filter((l) => l.isActive).length === 1) return 'At least one location must stay active.';
  update((d) => {
    const l = d.workLocations.find((x) => x.id === id)!;
    l.isActive = !l.isActive;
  });
  return null;
}

export const recentWeekStarts = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(weekStart(from), -7 * (i + 1)));
