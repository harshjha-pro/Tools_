/**
 * Digifluence Work Tracker — V1 front-end prototype
 *
 * Single, self-contained React component. No backend: all data lives in local
 * component state, seeded with mock data shaped after the V1 database schema
 * (employees, work_locations, stage_templates/stage_template_stages, projects,
 * project_assignments, internal_categories, work_entries).
 *
 * Demonstrates:
 *   E2  Employee Home Dashboard
 *   E3  Add Work Entry (project → stage → hours → description → location → save)
 *   E6  Today's Work (multi-project day with running total)
 *   E4  Week View (Project × Stage across the week)
 *   A4/A5/A7  Admin: create project, assign employees, set Project Allocation,
 *             Project Health (On Track / At Risk / Over Budget / Completed)
 */
import React, { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
 * Date helpers — single organization timezone, dates stored as YYYY-MM-DD
 * ========================================================================= */
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const weekdayIdx = (s) => (fromISO(s).getDay() + 6) % 7; // Mon=0 … Sun=6
const mondayOf = (s) => addDays(s, -weekdayIdx(s));
const TODAY = toISO(new Date());
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const fmtDate = (s, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  fromISO(s).toLocaleDateString("en-GB", opts);

/** Weekly cutoff (org_settings default): Sunday 4:00 PM closes that Mon–Sun week. */
const CUTOFF_HOUR = 16;
const isLocked = (date) => {
  const sunday = fromISO(addDays(mondayOf(date), 6));
  sunday.setHours(CUTOFF_HOUR, 0, 0, 0);
  return new Date() > sunday;
};

/* =========================================================================
 * Duration helpers — entries store hours (0–8) + minutes (0/15/30/45)
 * ========================================================================= */
const MINUTE_STEPS = [0, 15, 30, 45];
const entryMins = (e) => e.hours * 60 + e.minutes;
const fmtDur = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const fmtHrs = (mins) => {
  const v = Math.round((mins / 60) * 100) / 100;
  return `${v} ${v === 1 ? "hr" : "hrs"}`;
};
const round1 = (n) => Math.round(n * 10) / 10;
let editorSeq = 0; // remount key for the Add/Edit sheet

/* =========================================================================
 * Lookup data (Admin-editable lists in the real product)
 * ========================================================================= */
const LOCATIONS = [
  { id: 1, name: "Office" },
  { id: 2, name: "Work From Home" },
  { id: 3, name: "College" },
];

const INTERNAL_CATEGORIES = [
  { id: 1, name: "Meeting" },
  { id: 2, name: "Training" },
  { id: 3, name: "Administration" },
  { id: 4, name: "Business Development" },
  { id: 5, name: "Leave" },
  { id: 6, name: "Other" },
];

const mkStages = (base, names) => names.map((name, i) => ({ id: base + i + 1, name, order: i + 1 }));
const STAGE_TEMPLATES = [
  {
    id: 1,
    name: "Default",
    isDefault: true,
    stages: mkStages(100, [
      "Planning", "Research", "Design", "Development", "Testing", "Review",
      "Revision", "Finalization", "Deployment", "Maintenance", "Other",
    ]),
  },
  {
    id: 2,
    name: "SEO",
    stages: mkStages(200, ["Audit", "Keyword Research", "On-page", "Off-page", "Reporting"]),
  },
  {
    id: 3,
    name: "App Development",
    stages: mkStages(300, ["Planning", "UI/UX", "Development", "Testing", "Deployment"]),
  },
];
const STAGE_BY_ID = Object.fromEntries(
  STAGE_TEMPLATES.flatMap((t) => t.stages.map((s) => [s.id, { ...s, templateId: t.id }]))
);
const templateById = (id) => STAGE_TEMPLATES.find((t) => t.id === id);

const DESCRIPTION_CHIPS = [
  "UI changes", "Client revision", "Bug fixing", "Research", "Meeting", "Testing", "Deployment",
];

const PROJECT_COLORS = ["#4f6bed", "#0e9f8e", "#c2410c", "#9333ea", "#0891b2", "#be185d", "#65a30d", "#b45309"];
const INTERNAL_COLOR = "#8b94a7";

/* =========================================================================
 * Mock data — deterministic, generated relative to today so the demo always
 * has a realistic history (6 weeks back) and a partially logged current week.
 * ========================================================================= */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAGE_NOTES = {
  Planning: ["Sprint planning", "Scope breakdown"],
  Research: ["Competitor research", "Research"],
  Design: ["UI changes", "Checkout page mockups"],
  Development: ["Product listing API", "Bug fixing", "Cart & checkout flow"],
  Testing: ["Testing", "Regression pass"],
  Review: ["Client revision", "Internal review"],
  Revision: ["Client revision"],
  Finalization: ["Final asset handover"],
  Audit: ["Technical SEO audit", "Site crawl"],
  "Keyword Research": ["Keyword clustering", "Research"],
  "On-page": ["Meta tags & headings", "Internal linking"],
  "Off-page": ["Outreach list", "Guest post pitches"],
  Reporting: ["Monthly ranking report"],
  "UI/UX": ["Onboarding screens", "UI changes"],
};

function buildSeed() {
  const rnd = mulberry32(24);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const employees = [
    { id: 1, code: "EMP-1001", name: "Aarav Mehta", role: "employee", defaultLocationId: 1, locationEditable: true, joinDate: "2024-07-01" },
    { id: 2, code: "EMP-1002", name: "Sneha Iyer", role: "employee", defaultLocationId: 2, locationEditable: false, joinDate: "2025-01-13" },
    { id: 3, code: "EMP-1003", name: "Rohan Das", role: "employee", defaultLocationId: 1, locationEditable: true, joinDate: addDays(TODAY, -2) },
    { id: 4, code: "EMP-0001", name: "Priya Sharma", role: "admin", defaultLocationId: 1, locationEditable: true, joinDate: "2022-04-04" },
  ];

  const thisMon = mondayOf(TODAY);
  const historyStart = addDays(thisMon, -42);

  const projects = [
    { id: 1, code: "DF-019", name: "Brand Identity Refresh", templateId: 1, start: addDays(historyStart, 0), end: addDays(thisMon, -3), status: "active" },
    { id: 2, code: "DF-024", name: "E-commerce Website", templateId: 1, start: addDays(historyStart, -14), end: addDays(thisMon, 30), status: "active" },
    { id: 3, code: "DF-031", name: "SEO Campaign", templateId: 2, start: addDays(historyStart, 0), end: addDays(thisMon, 10), status: "active" },
    { id: 4, code: "DF-045", name: "Mobile Application", templateId: 3, start: addDays(historyStart, 7), end: addDays(thisMon, 75), status: "active" },
  ];

  const assignments = [
    { projectId: 2, employeeId: 1 }, { projectId: 3, employeeId: 1 }, { projectId: 4, employeeId: 1 },
    { projectId: 1, employeeId: 2 }, { projectId: 2, employeeId: 2 }, { projectId: 3, employeeId: 2 },
  ].map((a, i) => ({ id: i + 1, ...a, active: true, assignedBy: 4 }));

  const entries = [];
  let nextId = 1;
  const push = (e) =>
    entries.push({
      id: nextId++,
      description: "",
      deliverable: "",
      projectId: null,
      internalCategoryId: null,
      stageId: null,
      createdBy: e.employeeId,
      updatedBy: e.employeeId,
      ...e,
    });

  const projectStage = (projectId, date) => {
    const p = projects.find((x) => x.id === projectId);
    const stages = templateById(p.templateId).stages.filter((s) => !["Maintenance", "Other"].includes(s.name));
    const span = Math.max(1, (fromISO(p.end) - fromISO(p.start)) / 864e5);
    const progress = Math.min(1, Math.max(0, (fromISO(date) - fromISO(p.start)) / 864e5 / span));
    const idx = Math.min(stages.length - 1, Math.floor(progress * (stages.length - 1) + rnd() * 1.6));
    return stages[idx];
  };

  const plans = { 1: [2, 2, 3, 4], 2: [1, 2, 3, 1] };
  const missingTuesday = addDays(thisMon, 1);

  for (let d = historyStart; d < TODAY; d = addDays(d, 1)) {
    if (weekdayIdx(d) > 4) continue;
    for (const empId of [1, 2]) {
      if (empId === 1 && d === missingTuesday) continue; // demo: missing-entry nudge
      const emp = employees.find((e) => e.id === empId);
      const locationId = emp.locationEditable && rnd() < 0.3 ? 2 : emp.defaultLocationId;
      let remaining = 360 + Math.floor(rnd() * 7) * 15; // 6h – 7h30 of logged effort

      if (rnd() < 0.4) {
        const mins = pick([30, 45, 60]);
        push({ employeeId: empId, date: d, internalCategoryId: 1, hours: Math.floor(mins / 60), minutes: mins % 60, description: pick(["Team stand-up", "Client call", "Weekly sync"]), locationId });
        remaining -= mins;
      }
      const pids = plans[empId].filter((pid) => {
        const p = projects.find((x) => x.id === pid);
        return d >= p.start && d <= p.end;
      });
      if (!pids.length) continue;
      const blocks = rnd() < 0.55 && pids.length > 1 ? 2 : 1;
      const first = pids[Math.floor(rnd() * pids.length)];
      const chosen = blocks === 2 ? [first, pids.find((x) => x !== first) ?? first] : [first];
      chosen.forEach((pid, i) => {
        const mins = i === chosen.length - 1 ? remaining : Math.round((remaining * (0.45 + rnd() * 0.2)) / 15) * 15;
        remaining -= mins;
        const stage = projectStage(pid, d);
        push({
          employeeId: empId, date: d, projectId: pid, stageId: stage.id,
          hours: Math.floor(mins / 60), minutes: mins % 60,
          description: rnd() < 0.8 ? pick(STAGE_NOTES[stage.name] || DESCRIPTION_CHIPS) : "",
          locationId,
        });
      });
    }
  }
  // Something already logged today for Aarav, so the running total has a starting point.
  push({ employeeId: 1, date: TODAY, projectId: 2, stageId: 104, hours: 2, minutes: 30, description: "Cart & checkout flow", locationId: 1, deliverable: "" });

  // Project Allocation is derived from the seeded history so the demo shows every
  // health state regardless of what day it is opened on.
  const used = (pid) => entries.filter((e) => e.projectId === pid).reduce((s, e) => s + entryMins(e), 0) / 60;
  const targetPct = { 1: 1.16, 2: 0.86, 3: 1.03, 4: 0.42 };
  projects.forEach((p) => {
    p.allocatedHours = Math.max(20, Math.round(used(p.id) / targetPct[p.id] / 5) * 5);
  });

  const recognition = [
    { id: 1, employeeId: 1, kind: "applause", text: "Great work on the DF-024 checkout launch!", from: "Priya Sharma", date: addDays(TODAY, -3) },
    { id: 2, employeeId: 1, kind: "badge", text: "Problem Solver", from: "Priya Sharma", date: addDays(TODAY, -12) },
    { id: 3, employeeId: 2, kind: "badge", text: "Client Champion", from: "Priya Sharma", date: addDays(TODAY, -6) },
  ];

  return { employees, projects, assignments, entries, recognition };
}

/* =========================================================================
 * Project Health — Section 7 thresholds / Section 23 / Dev Spec 4.4
 * ========================================================================= */
const HEALTH = {
  on_track: { label: "On Track", cls: "ok" },
  at_risk: { label: "At Risk", cls: "warn" },
  over_budget: { label: "Over Budget", cls: "bad" },
  completed: { label: "Completed", cls: "done" },
};
function projectHealth(project, usedMins) {
  if (project.status === "archived") return "completed";
  const pct = usedMins / 60 / project.allocatedHours;
  if (pct >= 1.1) return "over_budget";
  if (pct >= 1.0) return "at_risk";
  return "on_track";
}
function thresholdLabel(pct) {
  if (pct >= 1.1) return "Significant Overrun";
  if (pct >= 1.0) return "Allocation Reached";
  if (pct >= 0.85) return "Approaching Allocation";
  return "Normal";
}

/* =========================================================================
 * Styles (scoped with a "dwt-" prefix; light + dark via CSS variables)
 * ========================================================================= */
const CSS = `
.dwt{--bg:#f4f5f8;--card:#fff;--ink:#1b2030;--muted:#646b7d;--line:#e3e6ee;--soft:#eef0f6;
--brand:#3f5bd9;--brand-ink:#fff;--brand-soft:#e8ecfd;--ok:#127a52;--ok-bg:#e3f5ec;--warn:#9a5b00;--warn-bg:#fdf1dc;
--bad:#b42318;--bad-bg:#fde8e6;--done:#475467;--done-bg:#eceff3;--shadow:0 1px 2px rgba(16,24,40,.06),0 4px 16px rgba(16,24,40,.06);
font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);
min-height:100vh;font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .dwt{--bg:#11141b;--card:#1a1e28;--ink:#e8eaf0;--muted:#9aa1b2;--line:#2a3040;--soft:#222837;
--brand:#7b93ff;--brand-ink:#0d1020;--brand-soft:#232b4a;--ok:#4cd39b;--ok-bg:#16332a;--warn:#f5b94e;--warn-bg:#3a2d14;
--bad:#ff8a80;--bad-bg:#3d1c1b;--done:#b6bfcc;--done-bg:#262c38;--shadow:none;color-scheme:dark}}
:root[data-theme="dark"] .dwt{--bg:#11141b;--card:#1a1e28;--ink:#e8eaf0;--muted:#9aa1b2;--line:#2a3040;--soft:#222837;
--brand:#7b93ff;--brand-ink:#0d1020;--brand-soft:#232b4a;--ok:#4cd39b;--ok-bg:#16332a;--warn:#f5b94e;--warn-bg:#3a2d14;
--bad:#ff8a80;--bad-bg:#3d1c1b;--done:#b6bfcc;--done-bg:#262c38;--shadow:none;color-scheme:dark}
.dwt *{box-sizing:border-box}
.dwt button,.dwt input,.dwt select,.dwt textarea{font:inherit;color:inherit}
.dwt-top{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:var(--card);border-bottom:1px solid var(--line)}
.dwt-top-in{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:10px 16px;margin:0 auto}
.dwt-logo{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.dwt-logo i{width:26px;height:26px;border-radius:8px;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;font-style:normal;font-size:13px}
.dwt-logo small{display:block;font-weight:500;color:var(--muted);font-size:11px;letter-spacing:0}
.dwt-viewas{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
@media (max-width:420px){.dwt-logo small,.dwt-viewas>span{display:none}}
.dwt-viewas select{padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--card);font-size:13px;max-width:190px}
.dwt-main{margin:0 auto;padding:16px 16px 110px}
.dwt-narrow{max-width:480px}.dwt-wide{max-width:1040px}
.dwt-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:var(--shadow)}
.dwt-stack>*+*{margin-top:12px}
.dwt-h1{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:0}
.dwt-h2{font-size:16px;font-weight:650;margin:0}
.dwt-sub{color:var(--muted);font-size:13px;margin:2px 0 0}
.dwt-row{display:flex;align-items:center;gap:8px}
.dwt-between{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dwt-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.dwt-stat{background:var(--soft);border-radius:12px;padding:10px 12px}
.dwt-stat b{display:block;font-size:20px;letter-spacing:-.02em}
.dwt-stat span{font-size:12px;color:var(--muted)}
.dwt-btn{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:600;font-size:14px}
.dwt-btn:hover{background:var(--soft)}
.dwt-btn:disabled{opacity:.5;cursor:not-allowed}
.dwt-btn.primary{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.dwt-btn.primary:hover{filter:brightness(1.07)}
.dwt-btn.ghost{border-color:transparent;background:transparent}
.dwt-btn.danger{color:var(--bad)}
.dwt-btn.sm{padding:6px 10px;font-size:13px;border-radius:8px}
.dwt-btn.block{width:100%}
.dwt-addwork{width:100%;padding:16px;font-size:17px;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:8px}
.dwt-links{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.dwt-link{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid var(--line);cursor:pointer;text-align:left}
.dwt-link:hover{border-color:var(--brand)}
.dwt-link small{display:block;color:var(--muted);font-size:12px;font-weight:400}
.dwt-link.soon{cursor:default;opacity:.6}.dwt-link.soon:hover{border-color:var(--line)}
.dwt-nudge{background:var(--warn-bg);color:var(--warn);border-radius:12px;padding:10px 12px;font-size:13px}
.dwt-info{background:var(--brand-soft);border-radius:12px;padding:10px 12px;font-size:13px}
.dwt-badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:3px 8px;border-radius:999px;white-space:nowrap}
.dwt-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.dwt-badge.ok{color:var(--ok);background:var(--ok-bg)}.dwt-badge.warn{color:var(--warn);background:var(--warn-bg)}
.dwt-badge.bad{color:var(--bad);background:var(--bad-bg)}.dwt-badge.done{color:var(--done);background:var(--done-bg)}
.dwt-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px;background:var(--soft);color:var(--muted)}
.dwt-entry{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);cursor:pointer;width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left}
.dwt-entry:first-child{border-top:0}
.dwt-dot{width:10px;height:10px;border-radius:3px;margin-top:5px;flex:none}
.dwt-entry-main{flex:1;min-width:0}
.dwt-entry-title{font-weight:600}
.dwt-entry-meta{font-size:13px;color:var(--muted)}
.dwt-entry-dur{font-weight:700;white-space:nowrap}
.dwt-distbar{display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--soft)}
.dwt-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:var(--muted)}
.dwt-legend span{display:inline-flex;align-items:center;gap:5px}
.dwt-legend i{width:8px;height:8px;border-radius:2px;display:inline-block}
.dwt-nav{position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--card);border-top:1px solid var(--line)}
.dwt-nav-in{max-width:480px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;padding:6px 8px calc(6px + env(safe-area-inset-bottom))}
.dwt-nav button{background:none;border:0;padding:8px 4px;border-radius:10px;cursor:pointer;color:var(--muted);font-size:12px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:2px}
.dwt-nav button.on{color:var(--brand)}
.dwt-nav svg{width:22px;height:22px}
.dwt-fab{position:fixed;right:max(16px,calc(50% - 224px));bottom:78px;z-index:31;border-radius:999px;padding:14px 20px;box-shadow:0 6px 20px rgba(63,91,217,.35);font-size:15px}
.dwt-sheet-bg{position:fixed;inset:0;z-index:50;background:rgba(10,14,25,.45);display:flex;align-items:flex-end;justify-content:center}
.dwt-sheet{background:var(--card);width:100%;max-width:480px;max-height:94vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px 16px 20px}
@media (min-width:700px){.dwt-sheet-bg{align-items:center}.dwt-sheet{border-radius:18px}}
.dwt-field{display:block}
.dwt-field>label,.dwt-label{display:block;font-size:12px;font-weight:650;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.dwt-input,.dwt-select{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);font-size:16px}
.dwt-input:focus,.dwt-select:focus{outline:2px solid var(--brand);outline-offset:-1px;border-color:transparent}
.dwt-seg{display:flex;background:var(--soft);border-radius:10px;padding:3px;gap:3px}
.dwt-seg button{flex:1;border:0;background:none;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;color:var(--muted)}
.dwt-seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dwt-seg button:disabled{cursor:not-allowed}
.dwt-seg.tight button{font-size:13px;white-space:nowrap;padding:8px 4px}
.dwt-chips{display:flex;flex-wrap:wrap;gap:6px}
.dwt-chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 11px;font-size:13px;cursor:pointer}
.dwt-chip.on{background:var(--brand-soft);border-color:var(--brand);color:var(--brand)}
.dwt-stepper{display:flex;align-items:center;gap:6px}
.dwt-stepper button{width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--card);font-size:20px;cursor:pointer}
.dwt-stepper output{min-width:56px;text-align:center;font-size:22px;font-weight:700}
.dwt-alloc{border-radius:12px;padding:10px 12px;background:var(--soft);font-size:13px}
.dwt-alloc-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}
.dwt-alloc-nums b{display:block;font-size:16px}
.dwt-alloc-nums span{color:var(--muted);font-size:11px}
.dwt-warn{margin-top:8px;color:var(--warn);font-weight:600}
.dwt-err{color:var(--bad);font-size:13px;margin-top:6px}
.dwt-total{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:12px;background:var(--brand-soft);font-size:14px}
.dwt-toast{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:60;background:#1b2030;color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:calc(100vw - 32px)}
.dwt-week-scroll{overflow-x:auto;margin:0 -16px;padding:0 16px}
.dwt-week{border-collapse:separate;border-spacing:0;width:100%;min-width:520px;font-size:13px}
.dwt-week th,.dwt-week td{padding:0;border-bottom:1px solid var(--line)}
.dwt-week thead th{font-size:12px;color:var(--muted);font-weight:600;padding:8px 4px;text-align:center}
.dwt-week thead th.today{color:var(--brand)}
.dwt-week th.rowh{text-align:left;padding:8px 8px 8px 0;font-weight:500;min-width:150px;position:sticky;left:0;background:var(--card);z-index:1}
.dwt-week td.cell{text-align:center;padding:3px}
.dwt-week td.cell button{width:100%;min-height:40px;border-radius:8px;border:1px dashed transparent;background:none;cursor:pointer;font-weight:650}
.dwt-week td.cell button.has{background:var(--brand-soft)}
.dwt-week td.cell button:not(.has){color:var(--muted);font-weight:400}
.dwt-week td.cell button:hover{border-color:var(--brand)}
.dwt-week td.cell button:disabled{cursor:default;border-color:transparent}
.dwt-week .future{opacity:.55}
.dwt-week .todaycol{background:color-mix(in srgb,var(--brand) 5%,transparent)}
.dwt-week tfoot td,.dwt-week tfoot th{font-weight:700;padding:8px 4px;text-align:center;border-bottom:0}
.dwt-week tfoot th{text-align:left;padding-left:0;position:sticky;left:0;background:var(--card);z-index:1}
.dwt-week td.rowtot{font-weight:700;text-align:right;padding:0 0 0 8px;white-space:nowrap}
.dwt-rowcode{font-weight:650}
.dwt-rowstage{display:block;color:var(--muted);font-size:12px}
.dwt-bar{position:relative;height:10px;border-radius:99px;background:var(--soft);overflow:hidden}
.dwt-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:99px}
.dwt-bar-wrap{position:relative}
.dwt-bar-ticks{position:absolute;inset:0;pointer-events:none}
.dwt-bar-ticks span{position:absolute;top:-2px;bottom:-2px;width:1px;background:var(--muted);opacity:.35}
.dwt-admin-grid{display:grid;grid-template-columns:1fr;gap:12px}
@media (min-width:860px){.dwt-admin-grid{grid-template-columns:1fr 1fr}}
.dwt-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
@media (min-width:700px){.dwt-kpis{grid-template-columns:repeat(4,1fr)}}
.dwt-people{display:flex;flex-wrap:wrap;gap:6px}
.dwt-person{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:3px 10px 3px 3px;font-size:13px;cursor:pointer;background:var(--card)}
.dwt-person.on{border-color:var(--brand);background:var(--brand-soft)}
.dwt-person:disabled{cursor:default}
.dwt-avatar{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:700;color:#fff;flex:none}
.dwt-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dwt-mini{font-size:12px;color:var(--muted)}
.dwt-hr{border:0;border-top:1px solid var(--line);margin:12px 0}
.dwt-empty{text-align:center;color:var(--muted);padding:24px 8px;font-size:14px}
.dwt-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;

/* =========================================================================
 * Small presentational pieces
 * ========================================================================= */
const Icon = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" /></svg>,
  week: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 4v17M13 4v17M18 4v17" /></svg>,
};

const initials = (name) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);
const AVATAR_COLORS = ["#4f6bed", "#0e9f8e", "#c2410c", "#9333ea", "#0891b2"];
const Avatar = ({ emp }) => (
  <span className="dwt-avatar" style={{ background: AVATAR_COLORS[emp.id % AVATAR_COLORS.length] }}>{initials(emp.name)}</span>
);

const HealthBadge = ({ health }) => <span className={`dwt-badge ${HEALTH[health].cls}`}>{HEALTH[health].label}</span>;

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dwt-sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dwt-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dwt-between" style={{ marginBottom: 12 }}>
          <h2 className="dwt-h2">{title}</h2>
          <button className="dwt-btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* =========================================================================
 * Root component
 * ========================================================================= */
export default function WorkTracker() {
  const seed = useMemo(buildSeed, []);
  const [employees] = useState(seed.employees);
  const [projects, setProjects] = useState(seed.projects);
  const [assignments, setAssignments] = useState(seed.assignments);
  const [entries, setEntries] = useState(seed.entries);
  const [recognition] = useState(seed.recognition);

  const [userId, setUserId] = useState(1);
  const [tab, setTab] = useState("home");
  const [editor, setEditor] = useState(null); // { entryId?, draft, nonce }
  const [toast, setToast] = useState(null);

  const user = employees.find((e) => e.id === userId);
  const isAdmin = user.role === "admin";

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const usedMinsByProject = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      if (e.projectId) m[e.projectId] = (m[e.projectId] || 0) + entryMins(e);
    });
    return m;
  }, [entries]);

  const projectColor = (pid) => PROJECT_COLORS[(pid - 1) % PROJECT_COLORS.length];

  // ---- Work entry targets for the signed-in employee -------------------
  const assignedProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.status === "active" && assignments.some((a) => a.active && a.projectId === p.id && a.employeeId === userId)
      ),
    [projects, assignments, userId]
  );
  const myEntries = useMemo(() => entries.filter((e) => e.employeeId === userId), [entries, userId]);

  const describeEntry = (e) => {
    if (e.projectId) {
      const p = projects.find((x) => x.id === e.projectId);
      return { title: `${p.code} — ${p.name}`, code: p.code, stage: STAGE_BY_ID[e.stageId]?.name, color: projectColor(p.id) };
    }
    const c = INTERNAL_CATEGORIES.find((x) => x.id === e.internalCategoryId);
    return { title: c.name, code: c.name, stage: "Internal work", color: INTERNAL_COLOR };
  };

  // ---- Editor ------------------------------------------------------------
  const openNew = (prefill = {}) =>
    setEditor({
      nonce: ++editorSeq,
      draft: {
        date: TODAY,
        target: "",
        stageId: "",
        hours: 0,
        minutes: 0,
        description: "",
        deliverable: "",
        locationId: user.defaultLocationId,
        ...prefill,
      },
    });
  const openEdit = (entry) =>
    setEditor({
      nonce: ++editorSeq,
      entryId: entry.id,
      draft: {
        date: entry.date,
        target: entry.projectId ? `p:${entry.projectId}` : `i:${entry.internalCategoryId}`,
        stageId: entry.stageId || "",
        hours: entry.hours,
        minutes: entry.minutes,
        description: entry.description,
        deliverable: entry.deliverable,
        locationId: entry.locationId,
      },
    });

  const saveEntry = (draft, { addAnother }) => {
    const [kind, rawId] = draft.target.split(":");
    const id = Number(rawId);
    const record = {
      employeeId: userId,
      date: draft.date,
      projectId: kind === "p" ? id : null,
      internalCategoryId: kind === "i" ? id : null,
      stageId: kind === "p" ? Number(draft.stageId) : null,
      hours: draft.hours,
      minutes: draft.minutes,
      description: draft.description.trim(),
      deliverable: draft.deliverable.trim(),
      locationId: Number(draft.locationId),
      updatedBy: userId,
    };
    const editingId = editor.entryId;
    const nextEntries = editingId
      ? entries.map((e) => (e.id === editingId ? { ...e, ...record } : e))
      : [...entries, { ...record, id: Math.max(0, ...entries.map((e) => e.id)) + 1, createdBy: userId }];
    setEntries(nextEntries);

    const dayTotal = nextEntries
      .filter((e) => e.employeeId === userId && e.date === draft.date)
      .reduce((s, e) => s + entryMins(e), 0);
    const when = draft.date === TODAY ? "today" : `on ${fmtDate(draft.date)}`;
    setToast(`${editingId ? "Updated" : "Saved"} · ${fmtHrs(dayTotal)} logged ${when}`);

    if (addAnother) {
      openNew({ date: draft.date, locationId: draft.locationId });
    } else {
      setEditor(null);
      if (tab === "home") setTab("today");
    }
  };

  const deleteEntry = (id) => {
    setEntries((list) => list.filter((e) => e.id !== id));
    setEditor(null);
    setToast("Entry removed");
  };

  // ---- Admin actions ---------------------------------------------------
  const createProject = (data) => {
    const nextNum = Math.max(0, ...projects.map((p) => Number(p.code.replace(/\D/g, "")))) + 1;
    const project = {
      id: Math.max(0, ...projects.map((p) => p.id)) + 1,
      code: `DF-${String(nextNum).padStart(3, "0")}`,
      name: data.name.trim(),
      templateId: Number(data.templateId),
      allocatedHours: Number(data.allocatedHours),
      start: data.start || null,
      end: data.end || null,
      status: "active",
    };
    setProjects((list) => [...list, project]);
    setAssignments((list) => {
      let nextId = Math.max(0, ...list.map((a) => a.id));
      return [...list, ...data.employeeIds.map((eid) => ({ id: ++nextId, projectId: project.id, employeeId: eid, active: true, assignedBy: userId }))];
    });
    setToast(`${project.code} created`);
    return project;
  };
  const updateAllocation = (pid, hours) => {
    setProjects((list) => list.map((p) => (p.id === pid ? { ...p, allocatedHours: hours } : p)));
    setToast("Project Allocation updated — health recalculated");
  };
  const toggleAssignment = (pid, eid) => {
    const p = projects.find((x) => x.id === pid);
    const emp = employees.find((x) => x.id === eid);
    const existing = assignments.find((a) => a.active && a.projectId === pid && a.employeeId === eid);
    if (existing) {
      setAssignments((list) => list.map((a) => (a.id === existing.id ? { ...a, active: false, unassignedBy: userId } : a)));
      setToast(`${emp.name} unassigned from ${p.code} — past entries kept`);
    } else {
      setAssignments((list) => [...list, { id: Math.max(0, ...list.map((a) => a.id)) + 1, projectId: pid, employeeId: eid, active: true, assignedBy: userId }]);
      setToast(`${emp.name} assigned to ${p.code}`);
    }
  };
  const archiveProject = (pid) => {
    setProjects((list) => list.map((p) => (p.id === pid ? { ...p, status: "archived", archivedBy: userId } : p)));
    setToast("Project archived — marked Completed");
  };

  const switchUser = (id) => {
    setUserId(id);
    setTab("home");
    setEditor(null);
  };

  const editorEntry = editor?.entryId ? entries.find((e) => e.id === editor.entryId) : null;

  return (
    <div className="dwt">
      <style>{CSS}</style>
      <header className="dwt-top">
        <div className={`dwt-top-in ${isAdmin ? "dwt-wide" : "dwt-narrow"}`}>
          <div className="dwt-logo">
            <i>DF</i>
            <div>
              Work Tracker
              <small>{isAdmin ? "Admin" : "Track work. See progress."}</small>
            </div>
          </div>
          <label className="dwt-viewas">
            <span>View as</span>
            <select value={userId} onChange={(e) => switchUser(Number(e.target.value))}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.role === "admin" ? "Admin" : "Employee"})
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {isAdmin ? (
        <main className="dwt-main dwt-wide">
          <AdminPanel
            admin={user}
            employees={employees}
            projects={projects}
            assignments={assignments}
            entries={entries}
            usedMinsByProject={usedMinsByProject}
            projectColor={projectColor}
            onCreate={createProject}
            onAllocation={updateAllocation}
            onToggleAssignment={toggleAssignment}
            onArchive={archiveProject}
          />
        </main>
      ) : (
        <>
          <main className="dwt-main dwt-narrow">
            {tab === "home" && (
              <HomeScreen
                user={user}
                myEntries={myEntries}
                assignedProjects={assignedProjects}
                recognition={recognition.filter((r) => r.employeeId === userId)}
                describeEntry={describeEntry}
                onAdd={() => openNew()}
                onNavigate={setTab}
              />
            )}
            {tab === "today" && (
              <DayScreen
                myEntries={myEntries}
                describeEntry={describeEntry}
                onEdit={openEdit}
                onAdd={(date) => openNew({ date })}
              />
            )}
            {tab === "week" && (
              <WeekScreen
                myEntries={myEntries}
                assignedProjects={assignedProjects}
                projects={projects}
                describeEntry={describeEntry}
                onEdit={openEdit}
                onAdd={openNew}
              />
            )}
          </main>

          {!editor && tab !== "home" && (
            <button className="dwt-btn primary dwt-fab" onClick={() => openNew()}>
              + Add Work
            </button>
          )}
          <nav className="dwt-nav" aria-label="Primary">
            <div className="dwt-nav-in">
              {[
                ["home", "Home", Icon.home],
                ["today", "Today", Icon.today],
                ["week", "Week", Icon.week],
              ].map(([key, label, icon]) => (
                <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}>
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </nav>

          {editor && (
            <EntrySheet
              key={editor.nonce}
              user={user}
              initial={editor.draft}
              editingEntry={editorEntry}
              assignedProjects={assignedProjects}
              projects={projects}
              myEntries={myEntries}
              usedMinsByProject={usedMinsByProject}
              onSave={saveEntry}
              onDelete={deleteEntry}
              onClose={() => setEditor(null)}
            />
          )}
        </>
      )}

      {toast && <div className="dwt-toast" role="status">{toast}</div>}
    </div>
  );
}

/* =========================================================================
 * E2 — Employee Home Dashboard
 * ========================================================================= */
function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function HomeScreen({ user, myEntries, assignedProjects, recognition, describeEntry, onAdd, onNavigate }) {
  const todays = myEntries.filter((e) => e.date === TODAY);
  const todayMins = todays.reduce((s, e) => s + entryMins(e), 0);
  const projectsTouched = new Set(todays.filter((e) => e.projectId).map((e) => e.projectId)).size;
  const stagesWorked = new Set(todays.filter((e) => e.stageId).map((e) => e.stageId)).size;

  const mon = mondayOf(TODAY);
  const elapsedWeekdays = Math.min(5, weekdayIdx(TODAY) + 1);
  const weekMins = myEntries.filter((e) => e.date >= mon && e.date <= TODAY).reduce((s, e) => s + entryMins(e), 0);
  const missing = [];
  for (let i = 0; i < Math.min(5, weekdayIdx(TODAY)); i++) {
    const d = addDays(mon, i);
    if (d >= user.joinDate && !myEntries.some((e) => e.date === d)) missing.push(DOW_LONG[i]);
  }
  const pending = assignedProjects.length === 0;

  return (
    <div className="dwt-stack">
      <div>
        <h1 className="dwt-h1">
          {greetingFor()}, {user.name.split(" ")[0]}
        </h1>
        <p className="dwt-sub">{fmtDate(TODAY, { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <section className="dwt-card dwt-stack" aria-label="Today's snapshot">
        <div className="dwt-between">
          <h2 className="dwt-h2">Today's snapshot</h2>
          <button className="dwt-btn ghost sm" onClick={() => onNavigate("today")}>View →</button>
        </div>
        <div className="dwt-grid3">
          <div className="dwt-stat"><b>{round1(todayMins / 60)}</b><span>hrs logged</span></div>
          <div className="dwt-stat"><b>{projectsTouched}</b><span>projects</span></div>
          <div className="dwt-stat"><b>{stagesWorked}</b><span>stages</span></div>
        </div>
        {todays.length > 0 ? (
          <div className="dwt-legend">
            {todays.map((e) => {
              const d = describeEntry(e);
              return (
                <span key={e.id}>
                  <i style={{ background: d.color }} />
                  {d.code} · {fmtDur(entryMins(e))}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="dwt-sub" style={{ margin: 0 }}>Nothing logged yet today.</p>
        )}
      </section>

      {pending ? (
        <div className="dwt-info">
          <b>Allocations Pending.</b> You haven't been assigned to a project yet. You can still log internal work
          (meetings, training) — your project list will appear here once Admin assigns you.
        </div>
      ) : null}

      <button className="dwt-btn primary dwt-addwork" onClick={onAdd}>
        <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>+</span> Add Work
      </button>

      {missing.length > 0 && (
        <div className="dwt-nudge">
          You haven't logged any work for {missing.join(", ")}.{" "}
          <button className="dwt-btn ghost sm" style={{ color: "inherit", padding: "0 4px", textDecoration: "underline" }} onClick={() => onNavigate("week")}>
            Open week
          </button>
        </div>
      )}

      <div className="dwt-card">
        <div className="dwt-between">
          <div>
            <div className="dwt-label" style={{ marginBottom: 2 }}>This week</div>
            <b style={{ fontSize: 18 }}>{fmtHrs(weekMins)} logged</b>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="dwt-mini">Your average this week</div>
            <b>{round1(weekMins / 60 / elapsedWeekdays)} hrs/day</b>
          </div>
        </div>
      </div>

      <div className="dwt-links">
        <button className="dwt-link" onClick={() => onNavigate("today")}>
          <span>Today's Work<small>{todays.length} {todays.length === 1 ? "entry" : "entries"}</small></span>→
        </button>
        <button className="dwt-link" onClick={() => onNavigate("week")}>
          <span>This Week<small>Project × Stage grid</small></span>→
        </button>
        <div className="dwt-link soon"><span>Calendar<small>Not in prototype</small></span></div>
        <div className="dwt-link soon"><span>Analytics<small>Not in prototype</small></span></div>
      </div>

      <section className="dwt-card">
        <div className="dwt-label">Recent achievements</div>
        {recognition.length === 0 ? (
          <p className="dwt-sub" style={{ margin: 0 }}>No applause or badges yet.</p>
        ) : (
          recognition.map((r) => (
            <div key={r.id} className="dwt-row" style={{ alignItems: "flex-start", marginTop: 8 }}>
              <span aria-hidden="true">{r.kind === "badge" ? "🏅" : "👏"}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{r.kind === "badge" ? `${r.text} badge` : `“${r.text}”`}</div>
                <div className="dwt-mini">from {r.from} · {fmtDate(r.date)}</div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/* =========================================================================
 * E3 — Add / Edit Work Entry
 * ========================================================================= */
function EntrySheet({ user, initial, editingEntry, assignedProjects, projects, myEntries, usedMinsByProject, onSave, onDelete, onClose }) {
  const [d, setD] = useState(initial);
  const [showDeliverable, setShowDeliverable] = useState(Boolean(initial.deliverable));
  const [tried, setTried] = useState(false);
  const set = (patch) => setD((cur) => ({ ...cur, ...patch }));

  const locked = isLocked(d.date);
  const readOnly = Boolean(editingEntry) && isLocked(editingEntry.date);

  // Keep a project that's no longer assigned selectable when editing an older entry.
  const projectOptions = useMemo(() => {
    const list = [...assignedProjects];
    if (editingEntry?.projectId && !list.some((p) => p.id === editingEntry.projectId)) {
      list.push(projects.find((p) => p.id === editingEntry.projectId));
    }
    return list;
  }, [assignedProjects, editingEntry, projects]);

  const [kind, rawId] = d.target ? d.target.split(":") : [null, null];
  const project = kind === "p" ? projects.find((p) => p.id === Number(rawId)) : null;
  const stages = project ? templateById(project.templateId).stages : [];
  const mins = d.hours * 60 + d.minutes;

  // Allocation preview (Section 7): Allocated / Used / Remaining, never blocking.
  let alloc = null;
  if (project) {
    const prior = (usedMinsByProject[project.id] || 0) - (editingEntry?.projectId === project.id ? entryMins(editingEntry) : 0);
    const after = prior + mins;
    const allocMins = project.allocatedHours * 60;
    alloc = {
      allocated: project.allocatedHours,
      used: round1(prior / 60),
      remaining: round1((allocMins - prior) / 60),
      exceededBy: after > allocMins ? round1((after - allocMins) / 60) : 0,
    };
  }

  const dayOthers = myEntries
    .filter((e) => e.date === d.date && e.id !== editingEntry?.id)
    .reduce((s, e) => s + entryMins(e), 0);

  const errors = {
    target: !d.target && "Choose a project or internal work type",
    stage: project && !d.stageId && "Choose a stage",
    hours: mins === 0 && "Enter the time spent",
    date: d.date < user.joinDate && "Date is before your join date",
  };
  const valid = !Object.values(errors).some(Boolean);

  const submit = (addAnother) => {
    setTried(true);
    if (!valid || locked) return;
    onSave(d, { addAnother });
  };

  const dateMode = d.date === TODAY ? "today" : d.date === addDays(TODAY, -1) ? "yesterday" : "pick";
  const [picking, setPicking] = useState(dateMode === "pick");
  const disabled = readOnly;

  return (
    <Sheet title={editingEntry ? "Edit work" : "Add work"} onClose={onClose}>
      <form
        className="dwt-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {/* Date */}
        <div className="dwt-field">
          <span className="dwt-label">Date</span>
          <div className="dwt-seg" role="group" aria-label="Date">
            <button type="button" disabled={disabled} className={dateMode === "today" && !picking ? "on" : ""} onClick={() => { setPicking(false); set({ date: TODAY }); }}>Today</button>
            <button type="button" disabled={disabled} className={dateMode === "yesterday" && !picking ? "on" : ""} onClick={() => { setPicking(false); set({ date: addDays(TODAY, -1) }); }}>Yesterday</button>
            <button type="button" disabled={disabled} className={picking || dateMode === "pick" ? "on" : ""} onClick={() => setPicking(true)}>Pick date</button>
          </div>
          {(picking || dateMode === "pick") && (
            <input
              className="dwt-input"
              style={{ marginTop: 8 }}
              type="date"
              value={d.date}
              min={user.joinDate}
              disabled={disabled}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
            />
          )}
          {tried && errors.date && <div className="dwt-err">{errors.date}</div>}
        </div>

        {locked && (
          <div className="dwt-nudge">
            🔒 The week of {fmtDate(mondayOf(d.date))} is locked (weekly cutoff: Sunday 4:00 PM). Ask Admin for a
            correction to change it.
          </div>
        )}

        {/* Project */}
        <div className="dwt-field">
          <label htmlFor="dwt-project">Project</label>
          <select
            id="dwt-project"
            className="dwt-select"
            value={d.target}
            disabled={disabled}
            onChange={(e) => set({ target: e.target.value, stageId: "" })}
          >
            <option value="">Select…</option>
            {projectOptions.length > 0 && (
              <optgroup label="My projects">
                {projectOptions.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Internal work">
              {INTERNAL_CATEGORIES.map((c) => (
                <option key={c.id} value={`i:${c.id}`}>{c.name}</option>
              ))}
            </optgroup>
          </select>
          {projectOptions.length === 0 && (
            <p className="dwt-mini" style={{ margin: "6px 0 0" }}>
              No project allocations yet — only internal work is available. If this looks wrong, raise a Helpdesk ticket.
            </p>
          )}
          {tried && errors.target && <div className="dwt-err">{errors.target}</div>}
        </div>

        {alloc && (
          <div className="dwt-alloc" aria-live="polite">
            <div className="dwt-alloc-nums">
              <div><b>{alloc.allocated}</b><span>Allocated hrs</span></div>
              <div><b>{alloc.used}</b><span>Logged hrs</span></div>
              <div><b>{alloc.remaining < 0 ? 0 : alloc.remaining}</b><span>Remaining hrs</span></div>
            </div>
            {alloc.exceededBy > 0 && (
              <div className="dwt-warn">⚠ Allocation exceeded by {alloc.exceededBy} {alloc.exceededBy === 1 ? "hour" : "hours"}. You can still save — this is just a heads-up.</div>
            )}
          </div>
        )}

        {/* Stage */}
        {project && (
          <div className="dwt-field">
            <label htmlFor="dwt-stage">Stage</label>
            <select id="dwt-stage" className="dwt-select" value={d.stageId} disabled={disabled} onChange={(e) => set({ stageId: e.target.value })}>
              <option value="">Select…</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {tried && errors.stage && <div className="dwt-err">{errors.stage}</div>}
          </div>
        )}

        {/* Hours */}
        <div className="dwt-field">
          <span className="dwt-label">Time spent</span>
          <div className="dwt-between" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="dwt-stepper">
              <button type="button" aria-label="Fewer hours" disabled={disabled || d.hours === 0} onClick={() => set({ hours: d.hours - 1 })}>−</button>
              <output aria-live="polite">{d.hours}h</output>
              <button type="button" aria-label="More hours" disabled={disabled || d.hours === 8} onClick={() => set({ hours: d.hours + 1 })}>+</button>
            </div>
            <div className="dwt-seg" role="group" aria-label="Minutes" style={{ flex: "1 1 180px" }}>
              {MINUTE_STEPS.map((m) => (
                <button type="button" key={m} disabled={disabled} className={d.minutes === m ? "on" : ""} onClick={() => set({ minutes: m })}>
                  {m}m
                </button>
              ))}
            </div>
          </div>
          <div className="dwt-chips" style={{ marginTop: 8 }}>
            {[[0, 30], [1, 0], [2, 0], [4, 0]].map(([h, m]) => (
              <button type="button" key={`${h}${m}`} disabled={disabled} className={`dwt-chip ${d.hours === h && d.minutes === m ? "on" : ""}`} onClick={() => set({ hours: h, minutes: m })}>
                {fmtDur(h * 60 + m)}
              </button>
            ))}
          </div>
          {tried && errors.hours && <div className="dwt-err">{errors.hours}</div>}
        </div>

        {/* Description */}
        <div className="dwt-field">
          <label htmlFor="dwt-desc">What did you work on? <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
          <input
            id="dwt-desc"
            className="dwt-input"
            maxLength={150}
            placeholder="e.g. Checkout page fixes"
            value={d.description}
            disabled={disabled}
            onChange={(e) => set({ description: e.target.value })}
          />
          <div className="dwt-chips" style={{ marginTop: 8 }}>
            {DESCRIPTION_CHIPS.map((c) => (
              <button type="button" key={c} disabled={disabled} className={`dwt-chip ${d.description === c ? "on" : ""}`} onClick={() => set({ description: d.description === c ? "" : c })}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="dwt-field">
          <span className="dwt-label">
            Location{!user.locationEditable && <span style={{ textTransform: "none", fontWeight: 400 }}> · set by Admin</span>}
          </span>
          <div className="dwt-seg tight" role="group" aria-label="Location">
            {LOCATIONS.map((l) => (
              <button type="button" key={l.id} className={Number(d.locationId) === l.id ? "on" : ""} disabled={disabled || !user.locationEditable} onClick={() => set({ locationId: l.id })}>
                {l.name}
              </button>
            ))}
          </div>
        </div>

        {/* Deliverable (optional) */}
        {showDeliverable ? (
          <div className="dwt-field">
            <label htmlFor="dwt-deliv">Deliverable / output <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
            <input id="dwt-deliv" className="dwt-input" placeholder="e.g. Fixed 7 bugs" value={d.deliverable} disabled={disabled} onChange={(e) => set({ deliverable: e.target.value })} />
          </div>
        ) : (
          !disabled && (
            <button type="button" className="dwt-btn ghost sm" style={{ alignSelf: "flex-start", paddingLeft: 0, color: "var(--brand)" }} onClick={() => setShowDeliverable(true)}>
              + Add a deliverable
            </button>
          )
        )}

        <div className="dwt-total">
          <span>{d.date === TODAY ? "Today" : fmtDate(d.date)} after saving</span>
          <b>{fmtHrs(dayOthers + mins)} logged</b>
        </div>

        {!readOnly && (
          <>
            <div className="dwt-split">
              <button type="button" className="dwt-btn" disabled={locked} onClick={() => submit(true)}>
                Save & add another
              </button>
              <button type="submit" className="dwt-btn primary" disabled={locked}>
                {editingEntry ? "Save changes" : "Save"}
              </button>
            </div>
            {editingEntry && (
              <button type="button" className="dwt-btn ghost danger sm" onClick={() => onDelete(editingEntry.id)}>
                Delete entry
              </button>
            )}
          </>
        )}
      </form>
    </Sheet>
  );
}

/* =========================================================================
 * E6 — Today's Work (Day Detail)
 * ========================================================================= */
function DayScreen({ myEntries, describeEntry, onEdit, onAdd }) {
  const [date, setDate] = useState(TODAY);
  const list = myEntries.filter((e) => e.date === date);
  const total = list.reduce((s, e) => s + entryMins(e), 0);
  const locked = isLocked(date);

  // Per-target distribution for the bar
  const groups = {};
  list.forEach((e) => {
    const d = describeEntry(e);
    groups[d.code] = groups[d.code] || { ...d, mins: 0 };
    groups[d.code].mins += entryMins(e);
  });

  return (
    <div className="dwt-stack">
      <div className="dwt-between">
        <button className="dwt-btn sm" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">←</button>
        <div style={{ textAlign: "center" }}>
          <h1 className="dwt-h1" style={{ fontSize: 19 }}>{date === TODAY ? "Today's Work" : fmtDate(date, { weekday: "long" })}</h1>
          <p className="dwt-sub">{fmtDate(date, { day: "numeric", month: "long", year: "numeric" })}{locked ? " · 🔒 Locked" : ""}</p>
        </div>
        <button className="dwt-btn sm" onClick={() => setDate(addDays(date, 1))} disabled={date >= TODAY} aria-label="Next day">→</button>
      </div>

      <div className="dwt-card dwt-stack">
        <div className="dwt-between">
          <div>
            <b style={{ fontSize: 24, letterSpacing: "-.02em" }}>{fmtHrs(total)}</b>
            <span className="dwt-sub"> logged</span>
          </div>
          <span className="dwt-mini">
            {Object.keys(groups).length} {Object.keys(groups).length === 1 ? "work item" : "work items"}
          </span>
        </div>
        {total > 0 && (
          <>
            <div className="dwt-distbar" aria-hidden="true">
              {Object.values(groups).map((g) => (
                <i key={g.code} style={{ width: `${(g.mins / total) * 100}%`, background: g.color }} />
              ))}
            </div>
            <div className="dwt-legend">
              {Object.values(groups).map((g) => (
                <span key={g.code}><i style={{ background: g.color }} />{g.code} {Math.round((g.mins / total) * 100)}%</span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="dwt-card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {list.length === 0 ? (
          <div className="dwt-empty">Nothing logged for this day yet.</div>
        ) : (
          list.map((e) => {
            const d = describeEntry(e);
            return (
              <button key={e.id} className="dwt-entry" onClick={() => onEdit(e)}>
                <span className="dwt-dot" style={{ background: d.color }} />
                <span className="dwt-entry-main">
                  <span className="dwt-entry-title" style={{ display: "block" }}>{d.title}</span>
                  <span className="dwt-entry-meta" style={{ display: "block" }}>
                    {d.stage} · {LOCATIONS.find((l) => l.id === e.locationId)?.name}
                    {e.updatedBy !== e.employeeId && " · Modified by Admin"}
                  </span>
                  {e.description && <span style={{ display: "block", fontSize: 14, marginTop: 2 }}>{e.description}</span>}
                  {e.deliverable && <span className="dwt-tag" style={{ marginTop: 4 }}>Output: {e.deliverable}</span>}
                </span>
                <span className="dwt-entry-dur">{fmtDur(entryMins(e))}</span>
              </button>
            );
          })
        )}
      </div>

      {!locked && (
        <button className="dwt-btn block" onClick={() => onAdd(date)}>
          + Add {list.length ? "another project" : "work"} for {date === TODAY ? "today" : fmtDate(date)}
        </button>
      )}
    </div>
  );
}

/* =========================================================================
 * E4 — Week View (Project × Stage × Day)
 * ========================================================================= */
function WeekScreen({ myEntries, assignedProjects, projects, describeEntry, onEdit, onAdd }) {
  const [weekStart, setWeekStart] = useState(mondayOf(TODAY));
  const [extraRows, setExtraRows] = useState({}); // weekStart -> [rowKey]
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ target: "", stageId: "" });
  const [cell, setCell] = useState(null); // { rowKey, date }
  const scrollRef = useRef(null);

  const weekEnd = addDays(weekStart, 6);
  const locked = isLocked(weekStart);
  const weekEntries = myEntries.filter((e) => e.date >= weekStart && e.date <= weekEnd);
  const hasWeekend = weekEntries.some((e) => weekdayIdx(e.date) > 4);
  const days = Array.from({ length: hasWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i));

  const rowKeyOf = (e) => (e.projectId ? `p:${e.projectId}:${e.stageId}` : `i:${e.internalCategoryId}`);
  const rowKeys = Array.from(new Set([...weekEntries.map(rowKeyOf), ...(extraRows[weekStart] || [])]));

  const rowInfo = (key) => {
    const [k, id, stageId] = key.split(":");
    if (k === "p") {
      const p = projects.find((x) => x.id === Number(id));
      return { code: p.code, stage: STAGE_BY_ID[stageId]?.name, order: `0-${p.code}-${String(STAGE_BY_ID[stageId]?.order).padStart(2, "0")}`, color: PROJECT_COLORS[(p.id - 1) % PROJECT_COLORS.length], prefill: { target: `p:${id}`, stageId } };
    }
    const c = INTERNAL_CATEGORIES.find((x) => x.id === Number(id));
    return { code: c.name, stage: "Internal", order: `1-${c.name}`, color: INTERNAL_COLOR, prefill: { target: `i:${id}`, stageId: "" } };
  };
  rowKeys.sort((a, b) => rowInfo(a).order.localeCompare(rowInfo(b).order));

  const cellEntries = (key, date) => weekEntries.filter((e) => rowKeyOf(e) === key && e.date === date);
  const sum = (list) => list.reduce((s, e) => s + entryMins(e), 0);
  const weekTotal = sum(weekEntries);
  const daysElapsed = weekStart === mondayOf(TODAY) ? Math.min(5, weekdayIdx(TODAY) + 1) : 5;

  // On narrow screens the grid scrolls sideways — bring today's column into view.
  useEffect(() => {
    const box = scrollRef.current;
    const th = box?.querySelector("thead th.today");
    if (box && th) box.scrollLeft = Math.max(0, th.offsetLeft + th.offsetWidth - box.clientWidth + 60);
  }, [weekStart, rowKeys.length]);

  const clickCell = (key, date) => {
    const list = cellEntries(key, date);
    if (list.length === 0 && !locked) onAdd({ date, ...rowInfo(key).prefill });
    else if (list.length === 1 && !locked) onEdit(list[0]);
    else if (list.length) setCell({ key, date });
  };

  const addRow = () => {
    const key = newRow.target.startsWith("p:") ? `${newRow.target}:${newRow.stageId}` : newRow.target;
    setExtraRows((m) => ({ ...m, [weekStart]: [...(m[weekStart] || []), key] }));
    setAdding(false);
    setNewRow({ target: "", stageId: "" });
  };
  const newRowProject = newRow.target.startsWith("p:") ? projects.find((p) => p.id === Number(newRow.target.slice(2))) : null;
  const newRowReady = newRow.target && (!newRowProject || newRow.stageId);

  return (
    <div className="dwt-stack">
      <div className="dwt-between">
        <button className="dwt-btn sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</button>
        <div style={{ textAlign: "center" }}>
          <h1 className="dwt-h1" style={{ fontSize: 19 }}>{weekStart === mondayOf(TODAY) ? "This Week" : "Week of " + fmtDate(weekStart, { day: "numeric", month: "short" })}</h1>
          <p className="dwt-sub">
            {fmtDate(weekStart, { day: "numeric", month: "short" })} – {fmtDate(weekEnd, { day: "numeric", month: "short" })}
            {locked ? " · 🔒 Locked" : " · locks Sun 4:00 PM"}
          </p>
        </div>
        <button className="dwt-btn sm" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={weekStart >= mondayOf(TODAY)} aria-label="Next week">→</button>
      </div>

      <div className="dwt-card dwt-between">
        <div>
          <b style={{ fontSize: 22, letterSpacing: "-.02em" }}>{fmtHrs(weekTotal)}</b>
          <span className="dwt-sub"> logged this week</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="dwt-mini">Average</div>
          <b>{round1(weekTotal / 60 / daysElapsed)} hrs/day</b>
        </div>
      </div>

      <div className="dwt-card">
        {rowKeys.length === 0 ? (
          <div className="dwt-empty">No work logged this week. Tap “+ Add row” to start the grid.</div>
        ) : (
          <div className="dwt-week-scroll" ref={scrollRef}>
            <table className="dwt-week">
              <thead>
                <tr>
                  <th className="rowh"><span className="dwt-sr">Project and stage</span></th>
                  {days.map((d) => (
                    <th key={d} className={`${d === TODAY ? "today" : ""} ${d > TODAY ? "future" : ""}`}>
                      {DOW[weekdayIdx(d)]}
                      <div style={{ fontWeight: 400 }}>{fromISO(d).getDate()}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rowKeys.map((key) => {
                  const info = rowInfo(key);
                  const rowTotal = sum(weekEntries.filter((e) => rowKeyOf(e) === key));
                  return (
                    <tr key={key}>
                      <th className="rowh" scope="row">
                        <span className="dwt-row" style={{ gap: 6 }}>
                          <i className="dwt-dot" style={{ background: info.color, marginTop: 0 }} />
                          <span>
                            <span className="dwt-rowcode">{info.code}</span>
                            <span className="dwt-rowstage">{info.stage}</span>
                          </span>
                        </span>
                      </th>
                      {days.map((d) => {
                        const m = sum(cellEntries(key, d));
                        return (
                          <td key={d} className={`cell ${d === TODAY ? "todaycol" : ""} ${d > TODAY ? "future" : ""}`}>
                            <button
                              className={m ? "has" : ""}
                              disabled={locked && !m}
                              onClick={() => clickCell(key, d)}
                              aria-label={`${info.code} ${info.stage} ${fmtDate(d)}: ${m ? fmtDur(m) : "empty"}`}
                            >
                              {m ? fmtDur(m) : locked ? "" : "+"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="rowtot">{rowTotal ? fmtDur(rowTotal) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th>Daily total</th>
                  {days.map((d) => {
                    const m = sum(weekEntries.filter((e) => e.date === d));
                    return <td key={d} className={d > TODAY ? "future" : ""}>{m ? round1(m / 60) : "–"}</td>;
                  })}
                  <td style={{ textAlign: "right" }}>{round1(weekTotal / 60)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {!locked &&
        (adding ? (
          <div className="dwt-card dwt-stack">
            <div className="dwt-label" style={{ margin: 0 }}>Add a row to this week</div>
            <select className="dwt-select" value={newRow.target} onChange={(e) => setNewRow({ target: e.target.value, stageId: "" })}>
              <option value="">Project or internal work…</option>
              <optgroup label="My projects">
                {assignedProjects.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.code} — {p.name}</option>)}
              </optgroup>
              <optgroup label="Internal work">
                {INTERNAL_CATEGORIES.map((c) => <option key={c.id} value={`i:${c.id}`}>{c.name}</option>)}
              </optgroup>
            </select>
            {newRowProject && (
              <select className="dwt-select" value={newRow.stageId} onChange={(e) => setNewRow({ ...newRow, stageId: e.target.value })}>
                <option value="">Stage…</option>
                {templateById(newRowProject.templateId).stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="dwt-split">
              <button className="dwt-btn" onClick={() => setAdding(false)}>Cancel</button>
              <button className="dwt-btn primary" disabled={!newRowReady} onClick={addRow}>Add row</button>
            </div>
          </div>
        ) : (
          <button className="dwt-btn block" onClick={() => setAdding(true)}>+ Add row</button>
        ))}
      <p className="dwt-mini" style={{ textAlign: "center" }}>
        Tap a cell to log or edit time. There's no daily target — log what you actually worked on.
      </p>

      {cell && (
        <Sheet title={`${rowInfo(cell.key).code} · ${fmtDate(cell.date)}`} onClose={() => setCell(null)}>
          {locked && <div className="dwt-nudge" style={{ marginBottom: 8 }}>🔒 This week is locked — entries are read-only.</div>}
          {cellEntries(cell.key, cell.date).map((e) => (
            <button key={e.id} className="dwt-entry" onClick={() => { setCell(null); onEdit(e); }}>
              <span className="dwt-dot" style={{ background: describeEntry(e).color }} />
              <span className="dwt-entry-main">
                <span className="dwt-entry-title" style={{ display: "block" }}>{describeEntry(e).stage}</span>
                <span className="dwt-entry-meta" style={{ display: "block" }}>{e.description || "No description"}</span>
              </span>
              <span className="dwt-entry-dur">{fmtDur(entryMins(e))}</span>
            </button>
          ))}
          {!locked && (
            <button className="dwt-btn block" style={{ marginTop: 8 }} onClick={() => { const k = cell; setCell(null); onAdd({ date: k.date, ...rowInfo(k.key).prefill }); }}>
              + Add more time
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}

/* =========================================================================
 * Admin — Projects, Project Allocation, Assignments, Project Health
 * ========================================================================= */
function AdminPanel({ admin, employees, projects, assignments, entries, usedMinsByProject, projectColor, onCreate, onAllocation, onToggleAssignment, onArchive }) {
  const [filter, setFilter] = useState("active");
  const [creating, setCreating] = useState(false);
  const staff = employees.filter((e) => e.role === "employee");

  const withHealth = projects.map((p) => {
    const used = usedMinsByProject[p.id] || 0;
    return { ...p, usedMins: used, health: projectHealth(p, used) };
  });
  const active = withHealth.filter((p) => p.status === "active");
  const counts = { on_track: 0, at_risk: 0, over_budget: 0 };
  active.forEach((p) => { counts[p.health] += 1; });

  const yesterday = (() => {
    let d = addDays(TODAY, -1);
    while (weekdayIdx(d) > 4) d = addDays(d, -1);
    return d;
  })();
  const incomplete = staff.filter((e) => e.joinDate <= yesterday && !entries.some((x) => x.employeeId === e.id && x.date === yesterday)).length;

  const shown = withHealth
    .filter((p) => filter === "all" || p.status === filter)
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="dwt-stack">
      <div className="dwt-between" style={{ flexWrap: "wrap" }}>
        <div>
          <h1 className="dwt-h1">Projects</h1>
          <p className="dwt-sub">Signed in as {admin.name} · Admin</p>
        </div>
        <button className="dwt-btn primary" onClick={() => setCreating((v) => !v)}>
          {creating ? "Close" : "+ Create project"}
        </button>
      </div>

      <div className="dwt-kpis">
        <div className="dwt-stat"><b>{active.length}</b><span>Active projects</span></div>
        <div className="dwt-stat"><b style={{ color: "var(--ok)" }}>{counts.on_track}</b><span>On Track</span></div>
        <div className="dwt-stat"><b style={{ color: "var(--warn)" }}>{counts.at_risk}</b><span>At Risk</span></div>
        <div className="dwt-stat"><b style={{ color: "var(--bad)" }}>{counts.over_budget}</b><span>Over Budget</span></div>
      </div>
      {incomplete > 0 && (
        <div className="dwt-nudge">
          {incomplete} {incomplete === 1 ? "employee has" : "employees have"} no work logged for {fmtDate(yesterday, { weekday: "long" })}.
        </div>
      )}

      {creating && (
        <CreateProjectForm
          staff={staff}
          projects={projects}
          onCancel={() => setCreating(false)}
          onCreate={(data) => {
            onCreate(data);
            setCreating(false);
            setFilter("active");
          }}
        />
      )}

      <div className="dwt-between" style={{ flexWrap: "wrap" }}>
        <div className="dwt-seg" role="group" aria-label="Status filter" style={{ minWidth: 260 }}>
          {[["active", "Active"], ["archived", "Archived"], ["all", "All"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="dwt-legend">
          <span>Health: hours logged vs Project Allocation —</span>
          <span><i style={{ background: "var(--ok)" }} />On Track &lt;100%</span>
          <span><i style={{ background: "var(--warn)" }} />At Risk 100–110%</span>
          <span><i style={{ background: "var(--bad)" }} />Over Budget ≥110%</span>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="dwt-card dwt-empty">No projects in this view.</div>
      ) : (
        <div className="dwt-admin-grid">
          {shown.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              staff={staff}
              assignments={assignments}
              entries={entries}
              color={projectColor(p.id)}
              onAllocation={onAllocation}
              onToggleAssignment={onToggleAssignment}
              onArchive={onArchive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project: p, staff, assignments, entries, color, onAllocation, onToggleAssignment, onArchive }) {
  const [editingAlloc, setEditingAlloc] = useState(false);
  const [allocInput, setAllocInput] = useState(String(p.allocatedHours));
  const [confirmArchive, setConfirmArchive] = useState(false);

  const usedHrs = p.usedMins / 60;
  const pct = usedHrs / p.allocatedHours;
  const remaining = p.allocatedHours - usedHrs;
  const archived = p.status === "archived";
  const barColor = { on_track: "var(--ok)", at_risk: "var(--warn)", over_budget: "var(--bad)", completed: "var(--done)" }[p.health];
  const scale = Math.max(1.2, pct); // bar shows up to 120% (or more if further over)

  const byEmployee = staff
    .map((e) => ({ emp: e, mins: entries.filter((x) => x.projectId === p.id && x.employeeId === e.id).reduce((s, x) => s + entryMins(x), 0) }))
    .filter((r) => r.mins > 0);
  const isAssigned = (eid) => assignments.some((a) => a.active && a.projectId === p.id && a.employeeId === eid);
  const allocValid = Number(allocInput) > 0;

  return (
    <article className="dwt-card dwt-stack">
      <div className="dwt-between" style={{ alignItems: "flex-start" }}>
        <div className="dwt-row" style={{ alignItems: "flex-start" }}>
          <span className="dwt-dot" style={{ background: color }} />
          <div>
            <div style={{ fontWeight: 700 }}>{p.code} — {p.name}</div>
            <div className="dwt-mini">
              {templateById(p.templateId).name} stages
              {p.start && p.end ? ` · ${fmtDate(p.start, { day: "numeric", month: "short" })} → ${fmtDate(p.end, { day: "numeric", month: "short" })}` : " · no planned dates"}
            </div>
          </div>
        </div>
        <HealthBadge health={p.health} />
      </div>

      <div>
        <div className="dwt-between" style={{ marginBottom: 6, fontSize: 14 }}>
          <span>
            <b>{round1(usedHrs)}</b> / {p.allocatedHours} hrs logged
          </span>
          <span className="dwt-mini">{Math.round(pct * 100)}% · {thresholdLabel(pct)}</span>
        </div>
        <div className="dwt-bar-wrap">
          <div className="dwt-bar">
            <i style={{ width: `${Math.min(100, (pct / scale) * 100)}%`, background: barColor }} />
          </div>
          <div className="dwt-bar-ticks" aria-hidden="true">
            {[0.7, 0.85, 1, 1.1].map((t) => (
              <span key={t} style={{ left: `${(t / scale) * 100}%`, opacity: t === 1 ? 0.8 : 0.35 }} />
            ))}
          </div>
        </div>
        <div className="dwt-mini" style={{ marginTop: 6 }}>
          {remaining >= 0 ? `${round1(remaining)} hrs remaining` : `Overrun: ${round1(-remaining)} hrs over Project Allocation`}
        </div>
      </div>

      {!archived && (
        <div>
          {editingAlloc ? (
            <form
              className="dwt-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!allocValid) return;
                onAllocation(p.id, Number(allocInput));
                setEditingAlloc(false);
              }}
            >
              <label className="dwt-sr" htmlFor={`alloc-${p.id}`}>Project Allocation (hours)</label>
              <input id={`alloc-${p.id}`} className="dwt-input" type="number" min="1" step="1" value={allocInput} onChange={(e) => setAllocInput(e.target.value)} style={{ maxWidth: 120, padding: "7px 10px", fontSize: 15 }} autoFocus />
              <span className="dwt-mini">hrs</span>
              <button className="dwt-btn sm primary" type="submit" disabled={!allocValid}>Save</button>
              <button className="dwt-btn sm ghost" type="button" onClick={() => { setEditingAlloc(false); setAllocInput(String(p.allocatedHours)); }}>Cancel</button>
            </form>
          ) : (
            <button className="dwt-btn sm" onClick={() => { setAllocInput(String(p.allocatedHours)); setEditingAlloc(true); }}>
              Edit Project Allocation
            </button>
          )}
        </div>
      )}

      <div>
        <div className="dwt-label">{archived ? "Team" : "Assigned employees · tap to assign / unassign"}</div>
        <div className="dwt-people">
          {staff.map((e) => {
            const on = isAssigned(e.id);
            if (archived && !on) return null;
            return (
              <button key={e.id} className={`dwt-person ${on ? "on" : ""}`} disabled={archived} onClick={() => onToggleAssignment(p.id, e.id)} aria-pressed={on}>
                <Avatar emp={e} />
                {e.name}
                {!archived && <span aria-hidden="true" style={{ color: "var(--muted)" }}>{on ? "✓" : "+"}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {byEmployee.length > 0 && (
        <div className="dwt-mini">
          Hours logged by: {byEmployee.map((r) => `${r.emp.name.split(" ")[0]} ${round1(r.mins / 60)}`).join(" · ")}
        </div>
      )}

      {!archived && (
        <>
          <hr className="dwt-hr" style={{ margin: 0 }} />
          {confirmArchive ? (
            <div className="dwt-row" style={{ flexWrap: "wrap" }}>
              <span className="dwt-mini">Archive {p.code}? It leaves employees' project lists; history is kept.</span>
              <button className="dwt-btn sm danger" onClick={() => onArchive(p.id)}>Archive</button>
              <button className="dwt-btn sm ghost" onClick={() => setConfirmArchive(false)}>Cancel</button>
            </div>
          ) : (
            <button className="dwt-btn sm ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => setConfirmArchive(true)}>
              Archive project…
            </button>
          )}
        </>
      )}
    </article>
  );
}

function CreateProjectForm({ staff, projects, onCreate, onCancel }) {
  const [f, setF] = useState({ name: "", templateId: 1, allocatedHours: "", start: "", end: "", employeeIds: [] });
  const [tried, setTried] = useState(false);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));

  const nextNum = Math.max(0, ...projects.map((p) => Number(p.code.replace(/\D/g, "")))) + 1;
  const nextCode = `DF-${String(nextNum).padStart(3, "0")}`;
  const errors = {
    name: !f.name.trim() ? "Project name is required" : f.name.length > 100 && "Max 100 characters",
    alloc: !(Number(f.allocatedHours) > 0) && "Project Allocation must be greater than 0",
    dates: f.start && f.end && f.end < f.start && "End date must be on or after the start date",
  };
  const valid = !Object.values(errors).some(Boolean);
  const toggleEmp = (id) => set({ employeeIds: f.employeeIds.includes(id) ? f.employeeIds.filter((x) => x !== id) : [...f.employeeIds, id] });

  return (
    <form
      className="dwt-card dwt-stack"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (valid) onCreate(f);
      }}
    >
      <div className="dwt-between">
        <h2 className="dwt-h2">New project</h2>
        <span className="dwt-tag">ID will be {nextCode}</span>
      </div>
      <div className="dwt-split" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="dwt-field">
          <label htmlFor="np-name">Project name</label>
          <input id="np-name" className="dwt-input" maxLength={100} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Corporate Website Redesign" autoFocus />
          {tried && errors.name && <div className="dwt-err">{errors.name}</div>}
        </div>
        <div className="dwt-field">
          <label htmlFor="np-alloc">Project Allocation</label>
          <input id="np-alloc" className="dwt-input" type="number" min="1" step="1" inputMode="numeric" value={f.allocatedHours} onChange={(e) => set({ allocatedHours: e.target.value })} placeholder="hrs" />
          {tried && errors.alloc && <div className="dwt-err">{errors.alloc}</div>}
        </div>
      </div>
      <div className="dwt-field">
        <label htmlFor="np-tpl">Stage template</label>
        <select id="np-tpl" className="dwt-select" value={f.templateId} onChange={(e) => set({ templateId: Number(e.target.value) })}>
          {STAGE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
        </select>
        <p className="dwt-mini" style={{ margin: "6px 0 0" }}>{templateById(f.templateId).stages.map((s) => s.name).join(" → ")}</p>
      </div>
      <div className="dwt-split">
        <div className="dwt-field">
          <label htmlFor="np-start">Planned start <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
          <input id="np-start" className="dwt-input" type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} />
        </div>
        <div className="dwt-field">
          <label htmlFor="np-end">Planned end <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span></label>
          <input id="np-end" className="dwt-input" type="date" value={f.end} min={f.start || undefined} onChange={(e) => set({ end: e.target.value })} />
        </div>
      </div>
      {tried && errors.dates && <div className="dwt-err">{errors.dates}</div>}
      <div>
        <div className="dwt-label">Assign employees</div>
        <div className="dwt-people">
          {staff.map((e) => {
            const on = f.employeeIds.includes(e.id);
            return (
              <button type="button" key={e.id} className={`dwt-person ${on ? "on" : ""}`} onClick={() => toggleEmp(e.id)} aria-pressed={on}>
                <Avatar emp={e} />
                {e.name}
                <span aria-hidden="true" style={{ color: "var(--muted)" }}>{on ? "✓" : "+"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="dwt-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="dwt-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="dwt-btn primary">Create {nextCode}</button>
      </div>
    </form>
  );
}
