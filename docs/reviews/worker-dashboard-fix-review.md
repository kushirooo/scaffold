# Worker dashboard project links (W1) — Review log

One entry per fix card. Appended by `reviewer`. Verdicts: PASS / PASS WITH CHANGES / BLOCK.

## W1 — Worker "My Projects" cards become links (task-9) — 2026-11-27 — PASS

Plan source: W1 card AC (`task-9`) + the request's focus list + `US05_FE_CHANGES.md` decision 3. No separate plan file exists in the repo; the card is the brief.

Scope: `git status` shows only the 3 scoped files (page.tsx, lib/projects.ts, lib/projects.test.mjs); `git diff --stat` +36/−14. No backend, schema, navbar, guard, layout, package.json or contract change.

Findings:
- Low (optional, a11y): `app/dashboard/page.tsx:150` — the focus ring is `ring-[#08086F]/40`, which composites to ~rgb(150,151,197) over `--color-canvas` (#f5f7ff) = **2.60:1** contrast, below the 3:1 non-text contrast for focus indicators (WCAG 2.2 SC 1.4.11), while `focus-visible:outline-none` suppresses the global 2px navy outline (`app/globals.css:100-103`). The project-list card link for the same pattern uses full-opacity `ring-brand-navy` (`app/projects/page.tsx:265`, 15.4:1). Suggested fix: one class, `focus-visible:ring-brand-navy` (or `/60`, 4.78:1). Ring is visible either way; not blocking.

Verified:
- Every worker card is `<Link href={projectDetailPath(project.id)}>` (`page.tsx:147-149`), helper does `encodeURIComponent(projectId)` (`lib/projects.ts:16-18`); target `/projects/[id]` is worker-reachable — the detail page loads `fetchAssignedProjects()` and matches by id for workers (`app/projects/[id]/page.tsx:66-74`).
- Accessible name includes the project name (`<h3>{project.name}`) plus Role/Due/"View project →"; anchor is keyboard focusable and has the visible "View project →" affordance. `<a>` wrapping `<article>` is valid flow content and contains no interactive descendant (no button/link/`tabindex`).
- PM/Admin/Viewer branches, empty state (`page.tsx:138-141`), header, and the whole notifications section are byte-identical to `main`; only the worker project-card block changed.
- New test asserts real encoding: `projectDetailPath('a/b c')` → `/projects/a%2Fb%20c`; removing `encodeURIComponent` (or swapping in `encodeURI`) fails it. Test is wired via the existing `node --test` list.
- `cd frontend/app && npm test` → 38/38 pass, 0 fail/skipped, including "builds the project detail path with an encoded id".

Note: `npm run lint` → 0 errors; the 2 warnings it prints are pre-existing in untouched `components/users/user-management-dashboard.tsx`. Implementer's browser probe was not repeated by the reviewer (no browser in this session); the link target and worker access path were checked statically.

Verdict: **PASS** (Low finding optional).
