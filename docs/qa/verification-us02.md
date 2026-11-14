# US02 verification — user management API

| Field | Value |
|---|---|
| Story | US02 — administrator user management (welcome-email seam, resend, delete policy, portal UI) |
| Owner | `implementer` (task-1 + task-3, kanban k334/k336) |
| Environment | Agent sandbox; Node v26.13.0, npm 12.2.2; local PostgreSQL 18, dedicated `raf_pms_e2e` (harness forces `EMAIL_TRANSPORT=memory`) |
| Revision | `stabilize/stab-us02-ui` @ `5ca5da3` + task-1/task-3 working tree (Lead owns the commit) |
| Status | **PASS** — API e2e + UI lint/test/build locally, Lead browser smoke 23/23 on the production build |

## 2026-11-15 — STAB-US02 API (task-1)

Shipped: `POST /users` emits `account.created` after commit (async listener; failure never
fails the `201`); `POST /users/:id/welcome-email/resend` (direct handler call, 200/404/409/502);
`DELETE /users/:id` refuses when the user owns any project (archived included) to stop the
`Project.owner onDelete: Cascade` data loss. No schema, migration, dependency or frontend change.

Review round (same day): reviewer verdict "PASS WITH CHANGES" (`docs/reviews/us02-review.md`)
applied in task-1 — honest 502 wording (previous link invalidated on `stage: send`), atomic
conditional delete (`user.deleteMany({ where: { id, ownedProjects: { none: {} } } })`), emit
moved outside the P2002 error mapping, scripted failure-path e2e, README line 11, contract parity.

Files: `src/users/user-management.{service,module,controller}.ts`; `test/user-management.e2e-spec.ts`;
`docs/api-contract-us02.md`; `README.md` (US02 bullet only).

## Commands run (from `backend/app`)

| # | Command | Result |
|---|---|---|
| 1 | `npm run lint` | exit 0 — 0 warnings, 0 errors (114 files, oxlint) |
| 2 | `npm run build` | exit 0 — `nest build` clean |
| 3 | `npx vitest run --config ./vitest.config.e2e.ts test/user-management.e2e-spec.ts` | exit 0 — 10/10 passed on `raf_pms_e2e` |
| 4 | `npx vitest run --config ./vitest.config.e2e.ts test/welcome-email.e2e-spec.ts` | exit 0 — 5/5 passed (seam regression) |

Note: the card's literal `npx vitest run test/welcome-email.e2e-spec.ts` finds no files under
the default config (`include: **/*.spec.ts` does not match `*.e2e-spec.ts`); command 4 runs the
same file with the e2e config.

## Acceptance criteria → evidence

| AC | Evidence |
|---|---|
| US18 AC1 — creating a user sends the welcome email | e2e "creates users, emits the welcome seam…": after the `201`, polls for an unused `INVITE` `PasswordResetToken` row **and** the in-memory `EMAIL_SENDER` message whose `to` is the created email; fails if the emit is removed |
| US18 AC3 — failure never fails creation | e2e "keeps the account committed…": scripted `failNext()` send → `201`, user + credential committed, one failed welcome attempt and one admin alert; async `{ async: true }` listener; command 4 |
| Resend: 200, replaces unused INVITE, one more email | e2e "resends the welcome email…": previous row `usedAt` set, exactly one fresh unused row with a different hash, second welcome message; `{ "status": "sent" }` |
| Resend 502 then retry | e2e "returns 502…": scripted send failure → `502 {code:'WELCOME_EMAIL_FAILED', stage:'send'}`, alert, user intact; retry → `200 {status:'sent'}`, delivered, one valid INVITE |
| Resend 404 / 409 / non-admin 403 | e2e: unknown id → `USER_NOT_FOUND`; inactive account → `USER_INACTIVE` with no second email; worker cookie → `403` |
| Delete policy 409 then 204 | e2e: archived-only project → `409 USER_OWNS_PROJECTS` (project and user survive); then active-only project → `409`; after the project is removed → `204` and the user is gone. Atomic conditional delete, so no count-then-delete race |
| Contract | `docs/api-contract-us02.md` — all `/users` endpoints, field mapping, error codes, seam note |

## Review

Reviewer verdict recorded in `docs/reviews/us02-review.md` (`PASS WITH CHANGES`, 1 MAJOR + 4
MINOR + 1 NIT); all findings applied in task-1 and checks re-run. Per the Lead, no re-review.
This local PASS covers lint/build/targeted e2e only; the full suite, `npm run test:db`, CI and
the `/user-management` UI (STAB-US02 UI) are not claimed here.


## 2026-11-15 — STAB-US02 UI (task-3, kanban k336)

Ported the admin prototype to the real portal shell and wired it to the merged US02 API.
`/users` = `SessionProvider → AuthGuard → AdminGuard`; non-admins get "Access Denied" and the
navbar Users link is admin-only; `/user-management` is a server `permanentRedirect` (308) to
`/users`. The dashboard keeps search/filters/pagination/table+card views, shows every contract
field, adds the honest async welcome-email toast with Resend, a per-row resend action
(200 / 502+Retry / 409 USER_INACTIVE), and surfaces `409 USER_OWNS_PROJECTS` verbatim on delete.
Removed the invented profile-picture upload, the `NEXT_PUBLIC_DEMO_MODE` path and the old
`frontend/app/user-management/**` prototype (dashboard, toast, styles, users-api, user-types);
the navbar now shows the real session user with a friendly role label.

New/changed files: `app/users/{page,layout}.tsx`, `app/user-management/page.tsx` (redirect),
`components/admin-guard.tsx`, `components/users/{user-management-dashboard,user-toast}.tsx`,
`components/navbar.tsx`, `lib/{users-api,user-admin}.ts`, `lib/user-admin.test.mjs`,
`types/users.ts`, `package.json` (`test` script). Review round (task-4, PASS WITH CHANGES):
`mergeUserRecord` keeps the displayed `lastActiveAt` after edit/status (the PATCH response omits
the sessions include) and a 9th `user-admin` test covers it; contract consumers/roles/401 wording
corrected. No re-review per the Lead.

## Commands run (from `frontend/app`)

| # | Command | Result |
|---|---|---|
| 1 | `npm run lint` | exit 0 — no warnings or errors (eslint) |
| 2 | `npm test` | exit 0 — 12/12 passed (`node --test`: 3 navigation + 9 user-admin) |
| 3 | `npm run build` | exit 0 — TypeScript clean; 14/14 pages; `/users` static; `/user-management` static route |

### Lead browser smoke — production build (15 Nov, `node .dsh-tools/pw/smoke-stab-us02-ui.mjs`)

Backend `EMAIL_TRANSPORT=memory` (`raf_pms` dev DB) + `next build && next start`; scripted
Playwright on Chromium: **23/23 PASS**, exit 0 (log + screenshots `artifacts/stabilization/80-…`, `40-…`–`44-…`).
Verified: anonymous `/users` → `/login?next=%2Fusers`; admin navbar Users link; `/users` renders
the real 6-account list with exactly one `GET /auth/me` per guarded navigation (refresh included;
no duplicate from the admin guard); `/user-management` → 308 → `/users`; create → 201 with the
async welcome-email toast; per-row Resend → `POST …/welcome-email/resend` 200 + toast; edit,
deactivate/reactivate; delete-owner fixture → `409 USER_OWNS_PROJECTS` message shown and account
kept, then 204 after the project is removed; worker: no Users link, `/users` shows "Access
Denied" with no redirect loop and no `GET /users`; no unexpected console errors (only the
expected login-page 401 probe and the intentional 409 status lines). Fixtures cleaned up.

## UI acceptance criteria → evidence

| AC | Evidence |
|---|---|
| 1. `/users` admin route + guard + navbar link | `app/users/layout.tsx`, `components/admin-guard.tsx`, `components/navbar.tsx`; command 3 route; Lead smoke — admin link + list, worker "Access Denied" and no link |
| 2. `/user-management` permanent redirect | `app/user-management/page.tsx` (`permanentRedirect`); command 3 route present |
| 3. List renders real fields + search/filter/pagination/table+card | `components/users/user-management-dashboard.tsx`; mapping case in command 2 |
| 4. Create + async welcome toast + inline duplicate error | dashboard `handleSaveUser`; `classifyUserApiError` duplicate-email case in command 2 |
| 5. Resend 200 / 502+Retry / 409 USER_INACTIVE | dashboard `handleResend`; error-code cases in command 2 |
| 6. Delete 409 USER_OWNS_PROJECTS message | dashboard `handleDelete`; owns-projects case in command 2 |
| 7. Alignment: real session user, no upload, no demo mode | `components/navbar.tsx` + dashboard header `useSession`; prototype directory deleted; grep clean |
| 8. Pure tests wired into `npm test` | `lib/user-admin.test.mjs` — admin gate, label/enum mapping, null lastActiveAt, error-code mapping, `mergeUserRecord`; fails if inverted |

## Review

Task-4 reviewer verdict (PASS WITH CHANGES) is in `docs/reviews/us02-review.md`; all findings
applied. This local PASS covers lint/unit/build; the Lead browser smoke (23/23, recorded above)
covers the production-build behaviour; backend e2e is unchanged by this frontend-only task and
CI is the Lead's gate.
