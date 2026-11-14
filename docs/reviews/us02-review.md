# US02 review — user management API (STAB-US02)

## 2026-11-15 — task-2 adversarial review (kanban k334)

| Field | Value |
|---|---|
| Tree reviewed | `stabilize/stab-us02-api` working tree vs `b32e1dc` (uncommitted; Lead owns the commit) |
| Files | `backend/app/src/users/user-management.{service,module,controller}.ts`, `test/user-management.e2e-spec.ts`, `docs/api-contract-us02.md`, `docs/qa/verification-us02.md`, `README.md` |
| Checks | read-only `git diff`/`status` + source/doc read; no suite re-run; no source edited |
| **Verdict** | **PASS WITH CHANGES** — 1 MAJOR, 4 MINOR, 1 NIT; nothing blocking |

Findings (order = severity):

1. `backend/app/src/users/user-management.service.ts:150-168` (+ `docs/api-contract-us02.md:109`) — **MAJOR** — the `502 WELCOME_EMAIL_FAILED` body says "The account was not changed", but `issueInvite` commits before the send (`prisma-reset-tokens.repository.ts:26-49`): on `stage: "send"` the previous unused INVITE row is already `usedAt`-stamped and a replacement row exists but was never delivered, so the old activation link is dead. Fix: restore/re-activate the previous token on send failure, or reword message+contract to "the previous activation link is no longer valid; retry the resend".

2. `backend/app/src/users/user-management.service.ts:265-276` — **MINOR** — check-then-act: `project.count()` and `user.delete()` are separate statements outside a transaction, so a project created/assigned to the user in between is still cascade-deleted (the "cascade unreachable" AC is not structural). Fix: single conditional delete, e.g. `user.deleteMany({ where: { id, ownedProjects: { none: {} } } })`, then map zero rows to `USER_OWNS_PROJECTS`/`USER_NOT_FOUND`.

3. `backend/app/test/user-management.e2e-spec.ts:236-298` — **MINOR** — no test exercises the 502 branch (card b) and none forces a send failure through `POST /users` to prove US18 AC3; removing the `failed` branch or awaiting the handler would stay green. Fix: spy on `EmailService.send` (or add `failNext` to the fake), assert `502 {code: "WELCOME_EMAIL_FAILED", stage}` and a failing create still returns 201 with user/credential committed.

4. `backend/app/src/users/user-management.service.ts:111-131` — **MINOR** — `this.events.emit(...)` sits inside the `try` that maps DB errors, so a synchronous emitter/listener throw would return 500 after the account committed (retry then 409). Fix: move the emit after the `try/catch`, as `docs/us02-seam.md` §3 shows.

5. `README.md:11` — **MINOR** — still says "US02 is not yet connected to the welcome-email seam (US18 AC1)", contradicting line 10 and the shipped code. Fix: replace with the remaining UI gap only (admin guard/navbar, alignment).

6. `docs/api-contract-us02.md:88-112` — **NIT** — contract omits responses the code returns: `404 USER_NOT_FOUND` for `PATCH /users/:id/status` and `400` invalid-UUID for the resend `ParseUUIDPipe` (and `DELETE`). Fix: add the missing rows for parity.

No findings on: token/password/hash exposure (resend body is exactly `{status:"sent"}`, logs carry ids only), auth/CSRF on the new route (global `CsrfGuard` + class admin guard, 403 proven), error non-enumeration, scope (no schema/migration/dependency/frontend change), or test tautology in the create/list/resend/delete assertions.

## 2026-11-15 — task-4 UI adversarial review (kanban k336)

| Field | Value |
|---|---|
| Tree | `stabilize/stab-us02-ui` working tree vs `5ca5da3` (uncommitted; Lead owns the commit) |
| Files | `app/users/*`, `components/{admin-guard,navbar}.tsx`, `components/users/*`, `lib/{users-api,user-admin}.ts`, `lib/user-admin.test.mjs`, `types/users.ts`, `app/user-management/page.tsx`, `package.json`, both US02 docs, `README.md` |
| Checks | read-only `git diff`/`status` + source/doc read; `npm test` (frontend) → 11/11 pass; no build/serve (Lead smoke log 23/23 PASS); no source edited |
| **Verdict** | **PASS WITH CHANGES** — 1 MINOR, 4 NIT; no blocking findings |

Findings (order = severity):

1. `frontend/app/components/users/user-management-dashboard.tsx:299-306,353-358` — **MINOR** — edit/status handlers replace the row with the PATCH response, and the API builds that body with `toPublicUser` on the transaction result with no `sessions` include (`backend/app/src/users/user-management.service.ts:222,265`), so `lastActiveAt` is always `null`: "Last active" flips to "Never" after any edit or status change until refresh. Fix: keep the previous row's `lastActiveAt` when merging, or include sessions in those API responses.

2. `docs/api-contract-us02.md:52` — **NIT** — §2 says `GET /users/roles` is "the static permission matrix the UI uses to render role options", but the shipped UI never calls it (`lib/users-api.ts` has no roles fetcher; the dashboard hardcodes `SYSTEM_ROLES`/`PERMISSIONS`). Fix: consume it or correct the wording.

3. `docs/api-contract-us02.md:175-176` — **NIT** — says the "users API client redirects a 401"; the redirect is in the dashboard (`user-management-dashboard.tsx:186-190,199`), not `lib/users-api.ts`. Reword.

4. `docs/api-contract-us02.md:5` — **NIT** — Consumers still names the portal UI as `/user-management`; the UI now consumes at `/users` (legacy path 308-redirects). Update.

5. `docs/qa/verification-us02.md:5-9` — **NIT** — header Owner/Revision still name task-1/`stabilize/stab-us02-api`/`b32e1dc` and Status says "browser smoke deferred to the Lead", while the appended Lead-smoke section reports 23/23 PASS; update the header to cover task-3/`stabilize/stab-us02-ui` and the finished smoke.

Verified clean (no findings): admin gate + navbar (worker "Access Denied", no `GET /users`, no loop), exactly one `/auth/me` per guarded navigation, async welcome-toast wording + Resend, 502/409/409 API messages and retry, contract §1 field mapping, no new dependency/`any`/suppression, no dead prototype imports, no scope creep.
