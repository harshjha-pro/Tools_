import type { DB, Employee, Project, StageTemplateStage, WorkEntry } from './types';
import { addDays, dow, iso, parse, range, today, weekStart } from './dates';

// Demo data generated relative to today, so the prototype always opens on a
// realistic "current week" no matter when it is run.

const DEFAULT_STAGES = [
  'Planning', 'Research', 'Design', 'Development', 'Testing', 'Review',
  'Revision', 'Finalization', 'Deployment', 'Maintenance', 'Other',
];
const SEO_STAGES = ['Audit', 'Keyword Research', 'On-page', 'Off-page', 'Reporting'];
const APP_STAGES = ['Planning', 'UI/UX', 'Development', 'Testing', 'Deployment'];

export const DESCRIPTION_CHIPS = [
  'UI changes', 'Client revision', 'Bug fixing', 'Research', 'Meeting', 'Testing', 'Deployment',
];

/** Deterministic PRNG so every reset produces the same demo. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function buildSeed(): DB {
  const t = today();
  const created = new Date(parse(addDays(t, -120))).toISOString();
  let seq = 0;
  const id = () => ++seq;

  const workLocations = ['Office', 'Work From Home', 'College'].map((name) => ({ id: id(), name, isActive: true }));
  const [office, wfh, college] = workLocations;

  const internalCategories = ['Meeting', 'Training', 'Administration', 'Business Development', 'Leave', 'Other'].map(
    (name) => ({ id: id(), name, isActive: true }),
  );
  const meeting = internalCategories[0];
  const training = internalCategories[1];

  const emp = (
    code: string, fullName: string, email: string, role: Employee['role'],
    loc: number, editable: boolean, joinDate: string,
  ): Employee => ({
    id: id(), employeeCode: code, fullName, loginEmail: email, role,
    defaultLocationId: loc, locationEditableByEmployee: editable,
    status: 'active', joinDate, offboardedAt: null,
  });

  const priya = emp('EMP-001', 'Priya Sharma', 'priya@digifluence.in', 'admin', office.id, true, '2023-01-09');
  const ravi = emp('EMP-002', 'Ravi Kumar', 'ravi@digifluence.in', 'employee', office.id, true, '2024-03-04');
  const ananya = emp('EMP-003', 'Ananya Iyer', 'ananya@digifluence.in', 'employee', wfh.id, false, '2024-08-12');
  const arjun = emp('EMP-004', 'Arjun Mehta', 'arjun@digifluence.in', 'employee', college.id, false, '2025-07-01');
  const sneha = emp('EMP-005', 'Sneha Patel', 'sneha@digifluence.in', 'employee', office.id, true, addDays(t, -2));
  const employees = [priya, ravi, ananya, arjun, sneha];

  const stageTemplates = [
    { id: id(), name: 'Default', isDefault: true, createdAt: created },
    { id: id(), name: 'SEO', isDefault: false, createdAt: created },
    { id: id(), name: 'App Development', isDefault: false, createdAt: created },
  ];
  const [tDefault, tSeo, tApp] = stageTemplates;
  const stageTemplateStages: StageTemplateStage[] = [];
  const addStages = (templateId: number, names: string[]) =>
    names.forEach((stageName, i) =>
      stageTemplateStages.push({ id: id(), stageTemplateId: templateId, stageName, sequenceOrder: i + 1, isActive: true }),
    );
  addStages(tDefault.id, DEFAULT_STAGES);
  addStages(tSeo.id, SEO_STAGES);
  addStages(tApp.id, APP_STAGES);

  const proj = (code: string, name: string, templateId: number, hrs: number, start: number, end: number): Project => ({
    id: id(), projectCode: code, name, stageTemplateId: templateId, allocatedHours: hrs,
    plannedStartDate: addDays(t, start), plannedEndDate: addDays(t, end),
    status: 'active', archivedAt: null, createdAt: created,
  });
  const ecommerce = proj('DF-024', 'E-commerce Website', tDefault.id, 250, -60, 45);
  const seo = proj('DF-031', 'SEO Campaign', tSeo.id, 100, -40, 20);
  const mobile = proj('DF-045', 'Mobile Application', tApp.id, 400, -30, 90);
  const brand = proj('DF-052', 'Brand Refresh', tDefault.id, 60, -35, 5);
  const projects = [ecommerce, seo, mobile, brand];

  const assignmentsMap: [Employee, Project[]][] = [
    [ravi, [ecommerce, mobile, seo]],
    [ananya, [seo, brand, ecommerce]],
    [arjun, [mobile, ecommerce]],
  ];
  const projectAssignments = assignmentsMap.flatMap(([e, ps]) =>
    ps.map((p) => ({
      id: id(), projectId: p.id, employeeId: e.id, assignedAt: created,
      assignedBy: priya.id, unassignedAt: null, isActive: true,
    })),
  );

  // ---- work entries ----
  const rand = rng(20261001);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const stagesOf = (p: Project) => stageTemplateStages.filter((s) => s.stageTemplateId === p.stageTemplateId);
  const ws = weekStart(t);
  // Start at the 1st of last month so the Calendar opens with a full history.
  const prevMonth = parse(t);
  prevMonth.setDate(1);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const from = [iso(prevMonth), addDays(ws, -21)].sort()[0];
  const workEntries: WorkEntry[] = [];

  const thisTuesday = addDays(ws, 1);
  const lastMonday = addDays(ws, -7);

  const deliverables = ['Created homepage UI', 'Fixed 7 bugs', 'Completed keyword research', 'Published 4 articles', 'Deployed version 2.1'];

  for (const [e, ps] of assignmentsMap) {
    for (const d of range(from, t)) {
      const wd = dow(d);
      if (wd === 0 || wd === 6) continue;
      if (e === ravi && d === thisTuesday && d < t) continue; // a missing day to surface
      if (e === ravi && d === t) continue; // Ravi hasn't logged today yet
      if (e === ananya && d === lastMonday) continue; // on approved leave
      const weekIdx = Math.max(0, 4 - Math.floor((parse(ws).getTime() - parse(weekStart(d)).getTime()) / (7 * 86400000)));
      const isToday = d === t;
      let remaining = isToday ? 3 * 60 : (5 + Math.floor(rand() * 4)) * 60 + pick([0, 15, 30, 45]);
      const count = isToday ? 1 : 1 + Math.floor(rand() * 3);
      const ts = new Date(parse(d));
      ts.setHours(18, 0, 0, 0);
      if (!isToday && rand() < 0.35) {
        const m = pick([30, 45, 60]);
        remaining -= m;
        workEntries.push(mk(e, d, null, rand() < 0.8 ? meeting.id : training.id, null, m, rand() < 0.5 ? 'Team sync' : '', ''));
      }
      const chosen = [...ps].sort(() => rand() - 0.5).slice(0, count);
      chosen.forEach((p, i) => {
        const last = i === chosen.length - 1;
        const m = last ? remaining : Math.max(60, Math.round((remaining / (chosen.length - i)) / 15) * 15);
        remaining -= m;
        const stages = stagesOf(p);
        // Later weeks drift toward later stages, so the data reads like real progress.
        const idx = Math.min(stages.length - 1, Math.floor((weekIdx * stages.length) / 7) + Math.floor(rand() * 2));
        const desc = rand() < 0.7 ? pick(DESCRIPTION_CHIPS.filter((c) => c !== 'Meeting')) : '';
        const deliv = rand() < 0.15 ? pick(deliverables) : '';
        workEntries.push(mk(e, d, p.id, null, stages[idx].id, m, desc, deliv));
      });
      function mk(
        who: Employee, date: string, projectId: number | null, catId: number | null,
        stageId: number | null, mins: number, description: string, deliverable: string,
      ): WorkEntry {
        return {
          id: id(), employeeId: who.id, entryDate: date, projectId, internalCategoryId: catId, stageId,
          hours: Math.floor(mins / 60), minutes: mins % 60, description,
          locationId: who.defaultLocationId, deliverable,
          createdBy: who.id, createdAt: ts.toISOString(), updatedBy: who.id, updatedAt: ts.toISOString(),
        };
      }
    }
  }

  // Tune two allocations so Admin sees "approaching" and "over budget" signals.
  const used = (p: Project) => workEntries.filter((w) => w.projectId === p.id).reduce((s, w) => s + w.hours + w.minutes / 60, 0);
  seo.allocatedHours = Math.max(10, Math.round(used(seo) / 0.9));
  brand.allocatedHours = Math.max(10, Math.round(used(brand) / 1.15));

  // ---- leave ----
  const leaveRequests: DB['leaveRequests'] = [
    {
      id: id(), employeeId: ananya.id, leaveType: 'full_day', startDate: lastMonday, endDate: lastMonday,
      halfDaySession: null, reason: 'personal', notes: '', status: 'approved',
      submittedAt: new Date(parse(addDays(lastMonday, -5))).toISOString(),
      reviewedBy: priya.id, reviewedAt: new Date(parse(addDays(lastMonday, -4))).toISOString(), rejectionComment: '',
    },
    {
      id: id(), employeeId: arjun.id, leaveType: 'full_day', startDate: addDays(ws, 11), endDate: addDays(ws, 11),
      halfDaySession: null, reason: 'holiday', notes: 'College exam', status: 'pending',
      submittedAt: new Date().toISOString(), reviewedBy: null, reviewedAt: null, rejectionComment: '',
    },
  ];

  // ---- one pending correction on a locked entry ----
  const lockedEntry = workEntries.find((w) => w.employeeId === ananya.id && w.entryDate === addDays(lastMonday, 2) && w.projectId);
  const correctionRequests: DB['correctionRequests'] = lockedEntry
    ? [{
        id: id(), workEntryId: lockedEntry.id, requestedBy: ananya.id,
        proposed: { hours: Math.min(8, lockedEntry.hours + 1), minutes: lockedEntry.minutes, description: lockedEntry.description || 'Client revision' },
        reason: 'I forgot to add the extra hour from the evening client call.',
        status: 'pending', reviewedBy: null, reviewedAt: null, reviewComment: '', createdAt: new Date().toISOString(),
      }]
    : [];

  return {
    version: 1,
    seq,
    workLocations,
    internalCategories,
    employees,
    stageTemplates,
    stageTemplateStages,
    projects,
    projectAssignments,
    workEntries,
    correctionRequests,
    leaveRequests,
    orgSettings: { weeklyCutoffDay: 0, weeklyCutoffTime: '16:00' },
    weeklyCutoffExtensions: [],
    auditLog: [],
  };
}
