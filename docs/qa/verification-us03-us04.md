# US03/US04 verification — projects, assignment, notifications

| Field | Value |
|---|---|
| Story | US03/US04 — projects, assignment, notifications (STAB-US03/US04, kanban k338) |
| Owner | `implementer` — task-1 (API), task-2 (UI) |
| Environment | Agent sandbox; Node v26.13.0, npm 12.2.2; local PostgreSQL 18 `raf_pms_e2e`; Next.js 16.4.5 |
| Revision | `stabilize/stab-us03-us04` @ `3f8a98d` (API) + `e7a43e4` (UI) + `c355cb5` (API fixes) + UI fix commit (Lead-owned) |
| Status | **PASS locally** — API e2e and frontend lint/unit/build green; reviewer, CI and Lead browser smoke remain |

## 2026-11-15 — STAB-US03/US04 API (task-1)

`PATCH /notifications/:id/read` (caller-scoped by `{ id, userId }`, 404 `Notification not found`,
atomic conditional `readAt` so concurrent calls keep the first timestamp, joined `projectName`) and
`POST /notifications/read-all` (`updateMany` over the caller's unread rows → `{ updated }`, 200).
Both behind `JwtAuthGuard` and the global `CsrfGuard`; no schema, migration, dependency or frontend
change. `project-members.e2e-spec.ts` covers own read + persisted `readAt`, idempotent second call,
foreign/unknown 404, malformed-id 400, exact read-all count then `0`, another user's row untouched, 401, and 403 without the CSRF header.

| # | Command (from `backend/app`) | Result |
|---|---|---|
| 1 | `npm run lint` | exit 0 — 0 warnings, 0 errors (114 files, oxlint) |
| 2 | `npm run build` | exit 0 — `nest build` clean |
| 3 | `npm test` | exit 0 — 22 files / 151 tests passed |
| 4 | `npm run test:e2e` | exit 0 — 8 files / 73 tests passed (`project-members` 4/4) |

Review round (same day): all five API findings applied — atomic conditional mark-read, malformed-uuid 400 e2e, persisted-`readAt` e2e assertion, no `viewer@` session in the new tests (PM-owned fixture), explicit `200` statuses in contract §1.

## 2026-11-15 — STAB-US03/US04 UI (task-2)

Types/client match the contract (`Project`, `CreateProjectInput`, `UpdateProjectInput`, `fetchAssignableWorkers`, `archiveProject`,
`markNotificationRead`, `markAllNotificationsRead`); new pure `lib/projects.ts` helpers plus 10 `node --test` cases wired into
`npm test`. The archived tab has no detail/edit links and shows the UTC-labelled 30-day restore window, with a disabled Restore
once expired. Budgets are `step="0.01"` inputs rendered as exactly two decimals (`$125,000.50`); both forms list every
`ApiError.details` item. The worker dashboard shows unread markers, per-row mark-read and mark-all, reconciling state
from the API after success; DESIGN.md §2.1 tokens are defined once in `globals.css`, and no raw hex remains in the five pages.

| # | Command (from `frontend/app`) | Result |
|---|---|---|
| 1 | `npm run lint` | exit 0 — no warnings or errors (eslint) |
| 2 | `npm test` | exit 0 — 22/22 passed (3 navigation + 9 user-admin + 10 projects) |
| 3 | `npm run build` | exit 0 — TypeScript clean; 14/14 pages |

UI review round (same day): five findings applied — UTC-labelled restore copy, read-all reconciles by refetching, all row buttons disabled while marking, `ProjectAssignableUser` typing for `/projects/assignable-workers`, real-`ApiError` helper case.

## Acceptance → evidence

| AC | Evidence |
|---|---|
| API mark-read caller-scoped, 404, idempotent, `projectName` | `notifications.{controller,service}.ts`; e2e "marks notifications read…" |
| API read-all counts only the caller's unread rows | e2e asserts exact `{updated}` then a second `{updated:0}` |
| Types/client match the contract; no `Partial<Project>` | `types/project.ts`, `services/projectService.ts`; UI command 3 |
| Archived tab: no dead links, deadline/expiry copy | `app/projects/page.tsx`; `restore*` helper boundary cases (UI command 2) |
| Budget exactly 2 dp and decimal entry | `formatCurrency` test; `step="0.01"` on new/edit; detail page |
| Validation arrays rendered item-by-item | `<ul>` over `formError.details` in `projects/new` and `projects/[id]/edit` |
| Worker unread / mark-read / mark-all | `app/dashboard/page.tsx`; real-`ApiError` case (UI command 2) |
| Tokens defined once; no raw hex outside `globals.css` | `app/globals.css`; grep of the five pages returns none |
| Contract §4 / README aligned | contract §4 names the endpoints and CSRF rules; README US03/US04 bullet updated |

Reviewer verdict (`docs/reviews/us03-us04-review.md`), Lead browser smoke and CI are the Lead's gates; no backend or schema change in task-2, no raw logs or secrets are recorded here.
