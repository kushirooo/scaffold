# US02 verification — user management API

| Field | Value |
|---|---|
| Story | US02 — administrator user management (welcome-email seam, resend, delete policy) |
| Owner | `implementer` (task-1, kanban k334) |
| Environment | Agent sandbox; Node v26.13.0, npm 12.2.2; local PostgreSQL 18, dedicated `raf_pms_e2e` (harness forces `EMAIL_TRANSPORT=memory`) |
| Revision | `stabilize/stab-us02-api` @ `b32e1dc` + task-1 working tree (Lead owns the commit) |
| Status | **PASS (after review fixes)** — lint/build/targeted e2e re-run; full suite and CI are the Lead's |

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

