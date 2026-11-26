# Project page two-column layout (W2) — Review log

One entry per fix card. Appended by `reviewer`. Verdicts: PASS / PASS WITH CHANGES / BLOCK.

## W2 — Project page two-column layout (task-11) — 2026-11-27 — PASS

Plan: W2 card AC (`task-11`). Scope: `git status` shows only `frontend/app/app/projects/[id]/page.tsx`; every diff hunk starts at line ≥ 223, so imports, state, effects, `handleAssignMember`, `handleRemoveMember` and all child-component props are byte-identical to HEAD. No service, API, child-component or other-file change.

Findings: none.

Verified:
- Grid `grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start` (page.tsx:262); the compiled production CSS contains `.lg:grid-cols-[minmax(0,1fr)_340px]{grid-template-columns:minmax(0,1fr) 340px}`. Left `min-w-0` column holds `ProjectMilestonesSection` then `ProjectTasksSection` (264-287); right `<aside aria-label="Project details and team">` holds Project Details then Team members (289-403). DOM order main→aside gives the required mobile single-column stacking.
- Header, the `notification` status banner and the PM read-only note stay outside the grid (224-260), so they remain full width above both columns.
- Project Details is a `<section>` + `h2` + `<dl>`; Start/End always, Budget only under `showBudgetCard` (unchanged line 220, PM-only).
- Team card is still gated by `{isProjectManager && ...}`, so workers see no team management; assign form preserved but stacked (`space-y-3`, full-width button) and only for `canManageMembers`; owner row shows "Project owner"; Remove button only for `canManageMembers` on non-owners; both empty states retained; the wide table is gone (now `ul`/`li`, 369-400).
- `[&>section]:mt-0` is correct: both children are `<section class="... mt-8">` (components/milestones/project-milestones-section.tsx:155, components/tasks/project-tasks-section.tsx:193). The compiled rule `.\[\&\>section\]\:mt-0>section{margin-top:0}` has specificity (0,1,1) and beats `.mt-8` (0,1,0); Tailwind v4 `space-y-6` spacing is `margin-block-end` inside `:where(...)`, so the 1.5rem inter-section gap survives. No double margin.
- Heading structure: page `h1` → card `h2`s; the aside has an accessible name.
- `cd frontend/app && npm test` → 42/42 pass, 0 fail/skipped; `npm run lint` → 0 errors (the 2 warnings are pre-existing in untouched `components/users/user-management-dashboard.tsx`); `npm run build` (extra check) succeeds and the production CSS chunk contains the new grid and section rules.

Note: labels/selects are identical to HEAD and contain no `htmlFor`/`id` in either version — no regression, but the pre-existing programmatic-association gap remains (out of W2 scope).

Verdict: **PASS**.
