# Digifluence Work Tracker — V1 front-end prototype

`WorkTracker.jsx` is a single, self-contained React component (default export, React 18+, no other
dependencies, styles embedded). All data lives in local component state; nothing is persisted.

## Using it

Drop it into any React app (Vite, Next.js client component, CodeSandbox, etc.):

```jsx
import WorkTracker from "./WorkTracker";
export default function App() { return <WorkTracker />; }
```

Use the **View as** selector in the header to switch between:

| User | What it shows |
|---|---|
| Aarav Mehta (Employee) | Assigned to DF-024, DF-031, DF-045; location can be changed; has a missing Tuesday this week |
| Sneha Iyer (Employee) | Assigned to DF-019, DF-024, DF-031; location fixed by Admin (Work From Home) |
| Rohan Das (Employee) | Newly joined, no projects — "Allocations Pending" state |
| Priya Sharma (Admin) | Projects panel: create, assign, set Project Allocation, health |

## What's covered (Dev Spec screen refs)

- **E2 Home** — greeting, today's snapshot (hours logged, projects, stages), + Add Work, weekly
  average, missing-entry nudge, recent applause/badges.
- **E3 Add / Edit Work** — Today / Yesterday / Pick date, project dropdown limited to assigned,
  non-archived projects (plus internal categories, which skip Stage), stage list from the project's
  stage template, hours 0–8 + minutes 0/15/30/45, optional description (≤150 chars) with suggestion
  chips, location (read-only when set by Admin), optional deliverable. Shows Allocated / Logged /
  Remaining hours and a non-blocking "Allocation exceeded by N hours" warning. Running day total,
  "Save & add another". Entries in a week past the Sunday 4:00 PM cutoff are read-only.
- **E6 Today's Work** — every entry for the day across projects, running total, distribution bar,
  previous-day navigation, tap to edit.
- **E4 Week View** — Project × Stage rows across Mon–Fri (Sat/Sun appear if used), row/day/week totals,
  tap a cell to log or edit, "+ Add row", previous weeks (locked) read-only.
- **A4/A5/A7 Admin** — create a project (auto ID e.g. DF-046, stage template, Project Allocation,
  optional planned dates, assign employees), edit allocation (health recalculates immediately),
  assign/unassign employees (history kept), archive (→ Completed), health per Section 7/23:
  On Track < 100%, At Risk 100–110%, Over Budget ≥ 110%, with Normal / Approaching (85%) /
  Reached / Significant Overrun labels.

Mock history is generated deterministically relative to today, and project allocations are derived
from it so the demo always shows each health state.

Not in this prototype: Calendar, Analytics, leave, copy/paste, correction requests, helpdesk, offline sync.

## Standalone demo

`demo.html` is the same prototype pre-bundled into one HTML file (React 18 loaded from cdnjs).
Open it directly in a browser — no build step. It's generated from `WorkTracker.jsx`, so edit the
component and rebuild rather than editing `demo.html` by hand.
