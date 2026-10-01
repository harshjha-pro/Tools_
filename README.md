# Digifluence Work Tracker — V1 prototype

A clickable MVP of the Digifluence Work Tracker, built from the V1 Spec, the Dev Spec, and the V1 database schema. There is no backend yet: state lives in the browser (`localStorage`), so it works immediately and offline.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

Other scripts:

| Script | What it does |
|---|---|
| `npm run build` | Production build into `dist/` (host on any static server) |
| `npm run build:single` | Everything inlined into one file, `dist-single/index.html`, which you can email or open straight from disk |
| `npm run typecheck` | TypeScript check |

## Trying it out

1. On the login screen, tap a demo account (or type an email / employee ID — there's no password in the prototype).
2. The dark strip at the top is for testing only. Use it to switch between **Employee view** and **Admin view**, switch which person you're signed in as, or **Reset demo data**.
3. Demo data is generated relative to today, so there's always a current week, a locked previous week, and some history.

| Account | Role | Good for testing |
|---|---|---|
| `priya@digifluence.in` (EMP-001) | Admin | Admin view; all Admin changes are attributed to Priya |
| `ravi@digifluence.in` (EMP-002) | Employee | 3 projects; nothing logged today yet; one missing day this week |
| `ananya@digifluence.in` (EMP-003) | Employee | Approved leave last Monday; a pending correction request; location fixed by Admin |
| `arjun@digifluence.in` (EMP-004) | Employee | Pending leave request |
| `sneha@digifluence.in` (EMP-005) | Employee | New joiner with no projects ("Allocations pending") |

Each browser keeps its own copy of the data. Two testers on different machines won't see each other's entries until there's a real backend.

## What's in it

**Employee (mobile-first):** Home, Week, Calendar, Me

- **Add work**: date (Today / Yesterday / Pick date / Multiple dates) → project (only assigned ones, plus internal categories) → stage (from the project's template) → hours 0–8 and minutes 0/15/30/45 → optional description with quick chips → location (locked if Admin fixed it) → optional deliverable. "Save & add another" logs several projects in a row, and a running day total updates as you go.
- **Project Allocation panel**: shows Allocated, Hours Logged, and Remaining for the chosen project. If an entry goes over, it warns ("Allocation exceeded by 4h") but still saves.
- **Week view**: a Project × Stage grid across Mon–Fri (weekend columns on demand). Type `2`, `1.5`, or `2:30` in a cell and it saves when you leave the cell; clear a cell to delete it. Also has Add row and Copy last week.
- **Calendar**: each day shows as logged, missing, leave, or locked. Weekends and future days are never marked missing. Tap a day to open Day Detail, where you can edit, add, copy the day to today, or request a correction on a locked entry.
- **Me**: profile, default location (if Admin allows changing it), and leave requests (apply, history, cancel while pending).
- Hours are shown as what was logged ("5h 30m logged today") plus a weekly average. The app never compares them to a target.

**Admin:** Overview, Hours, Projects, Assignments, Employees, Stage templates, Requests, Settings

- **Projects**: create, edit, and archive. Setting the Project Allocation and planned dates, picking a template, and assigning people at creation are all in one form. Health is computed from usage (On Track / At Risk / Over Budget / Completed).
- **Assignments**: an employee × project matrix where one tap assigns or unassigns. Unassigning only blocks future logging; past entries stay.
- **Stage templates**: create, reorder, add, and remove stages. A stage that already has entries is retired rather than deleted, so history stays accurate. A template can't be deleted while an active project uses it.
- **Hours**: every entry in the org, filterable by employee, project, dates, location, and stage. Admin can edit any field (including reassigning the employee or project) even in locked weeks. Each change goes into the audit trail and shows "Modified by Admin — Priya".
- **Employees**: roster with missing-day flags, add employee, location settings, offboarding (login revoked, history kept), and any employee's calendar or week.
- **Requests**: approve or reject leave and correction requests. Approving a correction applies it and re-locks the entry.
- **Settings**: weekly cutoff day and time (default Sunday 4:00 PM), the per-week "Reopen week" extension, and work locations.

### Weekly lock rule

Weeks run Monday–Sunday. A week locks at the first configured cutoff day/time on or after its Saturday. With the default setting, the week of 21–27 Sep locks on Sun 27 Sep at 4:00 PM. After that, employees see it read-only and can only request corrections. Admin can always edit, and can reopen one specific week until a chosen time.

## Code map

```
src/
  types.ts        In-memory tables mirroring the V1 PostgreSQL schema (camelCased columns)
  seed.ts         Demo data, generated relative to today
  store.ts        Tiny store: localStorage persistence, cross-tab sync, audit helpers, session
  actions.ts      All mutations + validation (the future API surface)
  logic.ts        Derived values: lock state, project health, allocation bands, day status
  dates.ts        Single-timezone date helpers
  ui.tsx          Sheet, toasts, inline confirm, pills, split strip
  employee/       E2–E8, E15 screens
  admin/          A1–A9 (minus analytics), A10, A19 screens
```

`actions.ts` is written as the seam for a real backend: every function validates its input, applies the change, and writes audit rows. Swapping it for API calls shouldn't require touching the screens.

## Not in this prototype

Real authentication, a shared backend, offline sync between devices, analytics dashboards, achievements and applause, helpdesk, data export, the Gantt chart, and archive PDF reports. These are P1/P2 items in the spec, or they depend on a backend.
