# US03/US04 review — projects, notifications and dashboard

## 15 Nov — API review (3f8a98d)

Commit `3f8a98d` on `stabilize/stab-us03-us04` (4 files, +252/-7). Read-only diff + context review; no suite re-run (implementer gates: lint 0/0, build, unit 151/151, e2e 72/72). Findings in severity order:

1. `backend/app/src/notifications/notifications.service.ts:31-44` — **MINOR** — concurrent double-mark breaks the contract promise "a second call keeps the first `readAt`" (`docs/api-contract-us03-us04.md:34-35`): both requests read `readAt: null`, then both run `update({ where: { id } })`, so the last write wins (each response may return a different timestamp). The `update` also relies on the earlier SELECT for the `userId` check. Fix: one atomic `updateMany({ where: { id, userId, readAt: null }, data: { readAt } })`, then `findFirst({ where: { id, userId } })` (404 when null) — keeps the first timestamp, keeps ownership in the predicate, and a concurrent delete becomes a clean 404 instead of a Prisma P2025 500.

2. `backend/app/test/project-members.e2e-spec.ts:302-314` — **MINOR** — the contract promises 400 for a malformed non-UUID id (`docs/api-contract-us03-us04.md:35`), but no test covers it; removing `ParseUUIDPipe` would route a bad id into Prisma and the suite would stay green. Fix: add `.patch('/notifications/not-a-uuid/read').set('Cookie', workerCookie).set(CSRF).expect(400)`.

3. `backend/app/test/project-members.e2e-spec.ts:294-300` — **NIT** — idempotency is asserted by string-equality of two response `readAt` values; a non-idempotent rewrite landing in the same millisecond would still pass (low probability, not currently flaky). Fix: after the second PATCH, assert the persisted row via `prisma.notification.findUnique` still has the first response's `readAt`.

4. `backend/app/test/project-members.e2e-spec.ts:305,348,384` — **NIT** — the new assertions reuse the seeded `viewer@rafconsult.test` cookie, while `test/auth.e2e-spec.ts:271-299,339-362` temporarily increments that account's `tokenVersion`/changes its role; e2e spec files share one database and run in parallel by default, so a transient 401 instead of the expected 404/200 is possible. Pre-existing hazard, amplified by the three added viewer requests. Fix: use a dedicated viewer account in this spec, or serialise the e2e suite (`fileParallelism: false` in `vitest.config.e2e.ts`).

5. `docs/api-contract-us03-us04.md:26-27` — **NIT** — the two new rows omit success status; the code deliberately forces 200 on `POST /notifications/read-all` (`notifications.controller.ts:35-36`) and `PATCH` defaults to 200, while the other POST rows show 201. Consumers (the UI task) can't tell 200 from 201. Fix: append `200` to both rows.

No findings on: caller scoping (both writes filter `userId`; foreign and unknown ids both 404 with the generic "Notification not found", no existence oracle; `GET /notifications` stays scoped), CSRF-before-auth coverage on both non-GETs and the 200 (not 201) status, read-all correctness (caller-only `{ userId, readAt: null }`, `updateMany` count, no over-update or leak), response shape/`projectName` join/`readAt` ISO serialisation, or scope (no schema/migration/dependency/frontend change, no `any`/`@ts-ignore`, no second suite). Assertions do fail on inverted caller scope, idempotency or read-all count; no trivially-passing test.

**Verdict: PASS WITH CHANGES** — 2 MINOR + 3 NIT, nothing blocking.

## 15 Nov — UI review (e7a43e4)

Commit `e7a43e4` (13 files, +707/-160, exactly task-2 scope). Read-only diff + context; targeted checks only: `node --test lib/projects.test.mjs` (10/10 pass) and a one-off real-`ApiError`→helper call; token utilities confirmed present in the existing `.next` production CSS. No full suite/build re-run. Findings in severity order:

1. `frontend/app/lib/projects.ts:23-28,65-73` — **MINOR** — the restore-deadline copy is formatted with `timeZone: 'UTC'` while every other date in these cards is local (`projects/page.tsx:189`, `updatedAt`): for archives outside UTC office hours the label is a day earlier than the real local deadline (archived 15 Nov 01:45 +08 shows "Restorable until 14 Dec 2026" though restore works to 15 Dec 01:45 local). The boundary logic itself is correct and mirrors the API (`isRestoreExpired` strict `now > deadline` ⇔ `projects.service.ts:245`). Fix: format in local time (derive expected test dates instead of hard-coding) or append "UTC" to the copy.

2. `frontend/app/app/dashboard/page.tsx:85-87` — **NIT** — read-all commits local state only when `updated > 0`: if another tab/session already read the rows, the API returns `{updated: 0}` and the stale unread badge/buttons remain, so "Mark all as read" appears inert; the stamped `readAt` is also the client clock, not the server's. Fix: reconcile on any 2xx (apply/refetch `/notifications`).

3. `frontend/app/app/dashboard/page.tsx:59,234` — **NIT** — while one row is marking, the other rows' "Mark as read" buttons stay enabled but `handleMarkRead` returns early, so their clicks are silently ignored. Fix: disable all row buttons while `markingId !== null`.

4. `frontend/app/services/projectService.ts:64` + `frontend/app/types/project.ts:11-16` — **NIT** — `fetchAssignableWorkers` returns `User[]` with `systemRole: string`, not the contract's `ProjectAssignableUser` (`systemRole: 'WORKER'`), so a non-worker payload type-checks; only `Project`/notification types mirror §3 exactly. Fix: add `ProjectAssignableUser` to `types/project.ts` and return it.

5. `frontend/app/lib/projects.test.mjs:66-120` — **NIT** — the `toProjectApiError` cases feed plain objects, never the real `ApiError` instance the forms pass (`Error.message` is non-enumerable); a refactor to read/spread enumerable props would keep all 10 tests green while the forms silently fell back to generic messages. Fix: add one case constructing `ApiError` from `lib/api.ts`.

Verified clean: archived tab has no dead links (title/View Details/Edit are active-branch only; archived branch is a static title + labelled Restore, disabled when expired or when `archivedAt` is missing); boundary covered at deadline/-1ms/+1ms; budgets exactly 2 dp via `Intl` + `step="0.01"` + non-finite guard; both forms render every `details` item (real `ApiError` path checked); notifications commit only after 2xx, errors in `role="alert"`, functional setState, double-submit guards, `applyReadAll` preserves first timestamps; `Project`/inputs/notification match §1-§3, no `Partial<Project>`, `any`, or `@ts-ignore`; renames complete; tokens additive-only (no `--background`/dark-mode change), no raw hex in the five pages, utilities generated; 13 files = task-2 scope, no backend/schema/dependency change; evidence 59 lines with matching 22 = 3+9+10 counts; README/contract §4 accurate. All 10 helper cases fail if their logic is inverted; none trivially pass.

**Verdict: PASS WITH CHANGES** — 1 MINOR + 4 NIT, nothing blocking.
