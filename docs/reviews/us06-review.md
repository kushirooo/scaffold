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
