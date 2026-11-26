# US06-be — Review log

One entry per card. Appended by `reviewer`. Verdicts: PASS / PASS WITH CHANGES / BLOCK.

## C1 — Rules, types, unit tests (task-2) — 2026-11-27 — PASS

Scope: `src/milestones/milestone.types.ts`, `milestone.rules.ts`, `milestone.rules.spec.ts` (all new, untracked; `git status` shows no other change — no schema/migration/`task.rules.ts` edit).

Findings: none.

Verified:
- `MilestoneResponse` matches contract §12.2 exactly: all 12 fields, `description: string | null`, dates/timestamps as `string`, computed fields included; no stored completion field. Conventions match `TaskResponse`.
- `milestone.rules.ts` re-exports `milestoneCompletionPercent` / `isMilestoneComplete` from `../tasks/task.rules.js` (no copied math); `isMilestoneOverdue` matches §3.2: past+incomplete true, today false, past+complete false. Floor and `totalTasks > 0` guards live in the reused helpers.
- Tests assert behaviour, not mocks. Inversion check: 199/200→99 kills rounding/ceil, 0/0 kills a dropped `totalTasks > 0`, today and past+complete cases kill a dropped `!isCompleted` / `<=` boundary. 3 tests, 9 assertions — all §11.1 cases present.

Checks run by reviewer: `npx vitest run src/milestones/milestone.rules.spec.ts` → 3/3 pass; `oxlint` on the three files → 0 warnings, 0 errors; `tsc --noEmit -p tsconfig.build.json` → clean.

Rubric: token/password/cookie, guard, CSRF, cookie flags, error-message items N/A at C1 (pure functions and types; no route, no I/O). No scope creep.

## C2 — Create and edit endpoints (task-3) — 2026-11-27 — PASS

Scope: 5 new milestone files + `app.module.ts`, `error-body.ts`, `error-body.spec.ts` (the three tracked edits total +13 lines); C1 files untouched (mtimes); no schema/migration/contract/FE edit. In scope.

Findings:
- Low (non-blocking, inherited): `dto/create-milestone.dto.ts:29-32`, `dto/update-milestone.dto.ts:30-34` — `targetDate` has no trim `@Transform`, so a space-padded date (`" 2026-12-05"`) 400s `INVALID_TARGET_DATE` instead of being trimmed per contract §1.1. Same as US05 `dueDate` (`dto/create-task.dto.ts:26-28`); not introduced by this card. Optional fix: trim targetDate in both milestone DTOs together.

Verified (no finding):
- Access order: PATCH role (`milestones.service.ts:91-93`) → load (`95-101`) → `requireProjectManager` (`103-106`), so worker/Admin/Viewer 403 before 404; other PM and archived project 404 via `ProjectAccessService.load` (`isArchived: false`). POST checks access before create (`70`).
- Empty PATCH: `400 VALIDATION_FAILED` `At least one milestone field must be provided.` (`113-117`), exact plan §8.2 wording; placed after access, same order as US05 update.
- `description: null` clears (`76`, `126-128`); DTO `ValidateIf` skips null; trim on name/description in DTO and service; unknown/computed body fields rejected by global `whitelist`/`forbidNonWhitelisted` pipe.
- `INVALID_TARGET_DATE` mapping + test (`error-body.ts:17`, `error-body.spec.ts:42-51`); YYYY-MM-DD regex + strict `IsDateString`; no past rule, no project-date bound, no 409.
- Progress: one grouped query helper (`154-188`) with `deletedAt: null`; create returns zeros without a query (`82-83`); update reuses the helper (`140-143`); `APP_TIMEZONE` today (`146-148`, `214`).
- Envelopes §8.1/§8.2 messages and 201/200 codes; guards/filter/`ParseUuidPipe` mirror US05; module wiring mirrors TasksModule and is registered.

Rubric: no token/password/cookie value in a response or log; auth/CSRF guards unchanged (global CSRF APP_GUARD runs before controller guard); cookie flags N/A; new test fails if the mapping is removed; no scope creep; catalogued messages match §13.1/§13.2.

Checks run by reviewer: `tsc --noEmit -p tsconfig.build.json` → clean; `oxlint` on changed files → 0/0; `vitest run src/common/error-body.spec.ts src/milestones/milestone.rules.spec.ts` → 11/11 pass.

Residual risk (not a finding): DTO/service paths have no unit test at C2; behaviour is proven by C4 e2e per plan §11.2.

## C3 — List endpoint with progress (task-4) — 2026-11-27 — PASS

Scope: `git diff` since C2 (`3a1dc26`) touches only `milestones.service.ts` and `milestones.controller.ts`; `git diff --name-only` confirms no other file. Diff is purely the list route + service method.

Findings: none.

Verified:
- `requireProjectMember` runs first (`milestones.service.ts:91`): Admin/Viewer 403 `FORBIDDEN_ROLE`, non-member worker / other PM / archived project 404 `NOT_FOUND` (the load filters `isArchived: false` and checks owner-or-member row). No milestone query runs before the access check.
- Sort `orderBy: [{ targetDate: 'asc' }, { name: 'asc' }]` (`95`) matches contract §8.3; same shape as US05 (`tasks.service.ts:141`).
- Exactly one `taskCounts` call for the whole list (`99-101`); that helper is a single `groupBy` with `deletedAt: null` (`154-188`), and returns before querying when the list is empty. No per-milestone query; no `findMany` include of tasks.
- `today()` computed once (`94`) and reused for every row; empty project returns `[]`; missing counts fall back to `NO_TASKS`.
- Controller `GET projects/:projectId/milestones` returns `{ data }` (`milestones.controller.ts:36-43`); no `@Query`, no pagination params, no 409, no DELETE.
- Response mapping reuses `toResponse`, so shapes/envelopes stay identical to C2.

Rubric: read-only route exposes no token/password/cookie value and adds no logging; auth + global CSRF guards unchanged; no new tests were possible/needed here (C4 e2e covers read access, sort, counts, and the deleted-task case); no scope creep; no catalogued error wording changed.

Checks run by reviewer: `tsc --noEmit -p tsconfig.build.json` → clean; `oxlint` on the two files → 0/0; `vitest run src/milestones/milestone.rules.spec.ts src/common/error-body.spec.ts` → 11/11 pass.
