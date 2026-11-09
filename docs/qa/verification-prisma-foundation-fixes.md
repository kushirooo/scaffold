# Independent Re-verification — T1 Review Fixes (F1/F2/F4)

| Field | Value |
|---|---|
| Task | `task-7` — re-verify the T1 delta after the T4 review fixes (T6); not a full re-review of the foundation |
| Fix implemented by | `backend-dev` (T6) |
| Verified by | `qa-engineer` (independent reproduction) |
| Date / time | 2026-11-09 12:25–12:30 +08 (Asia/Kuala_Lumpur) |
| Repository | `scaffold` — branch `feat/prisma-foundation`, HEAD `0552217`; T1 + T6 changes are **uncommitted in the working tree** (Lead owns the commit) |
| Environment | Agent sandbox — **no Docker/Postgres**; Node v26.13.0, npm 12.2.2, Vitest 4.1.11, Prettier 3.9.6 |
| Baseline for this document | [`verification-prisma-foundation.md`](verification-prisma-foundation.md) (T5) + `docs/reviews/prisma-foundation-review.md` (T4, `PASS WITH CHANGES`, F1/F2/F4) |
| Verdict | **PASS** — F1/F2/F4 all closed; 0 new defects; the 9-file `prettier --check .` failure is pre-existing formatting debt outside T6 (known gap, not a blocker); DB checks remain `DEFERRED (no DB)` |

**Scope of this pass:** only the T6 delta (new repository specs, generated-client format/coverage boundaries, seed transaction shape). The schema, migration and Prisma wiring were verified in T5 and are unchanged by T6; they are not re-litigated here. No source was edited during verification — the mutation run used a throwaway copy under `/tmp` and the original files' digest was identical before and after.

Raw outputs: [`docs/qa/evidence/2026-11-09-t7/`](evidence/2026-11-09-t7/).

---

## 1. Commands and results

Run from `/home/anoshizuku/Projects/scaffold/backend/app`.

| # | Command | Exit | Result | Evidence |
|---|---|---|---|---|
| 1 | `npm run lint` | 0 | `Found 0 warnings and 0 errors.` · `35 files` (was 33; +2 new spec files) | [`lint.log`](evidence/2026-11-09-t7/lint.log) |
| 2 | `npm test` | 0 | `Test Files 6 passed (6)` · `Tests 25 passed (25)`: 11 prior + **9** user-repo + **5** session-repo | [`unit-test.log`](evidence/2026-11-09-t7/unit-test.log) |
| 3 | `npm run build` | 0 | `nest build` exit 0; `dist/main.js` created (ESM) | [`build.log`](evidence/2026-11-09-t7/build.log), [`build-artifact.txt`](evidence/2026-11-09-t7/build-artifact.txt) |
| 4 | `npm run test:e2e` | 0 | `Test Files 2 passed (2)` · `Tests 13 passed (13)` (unchanged; in-memory repos, no DB) | [`e2e-test.log`](evidence/2026-11-09-t7/e2e-test.log) |
| 5 | `npm run test:cov` | 0 | 25/25; coverage report; **0** `src/generated` or `dist/` entries | [`coverage.log`](evidence/2026-11-09-t7/coverage.log) |
| 6 | `npx prettier --check .` | **1** | 9 warnings, all pre-existing files **outside T6**; `src/generated/` is not scanned | [`prettier-check.log`](evidence/2026-11-09-t7/prettier-check.log) |
| 7 | `npx prettier --file-info <generated/dist/coverage/source>` | 0 | generated/dist/coverage → `"ignored": true`; source repo → `"ignored": false` | [`prettier-file-info.log`](evidence/2026-11-09-t7/prettier-file-info.log) |
| 8 | Mutation matrix on throwaway copy (see §2.3) | — | baseline 14/14; **8/8 mutations caught** | [`mutation-testing.log`](evidence/2026-11-09-t7/mutation-testing.log) |
| 9 | Static assertions for F4 seed order + no-pg/shim/scope checks | 0 | all assertions true (§4, §5) | [`static-checks.log`](evidence/2026-11-09-t7/static-checks.log) |

Command expected by T6: `npx prettier --check .` (the project has no `format:check` script; Prettier 3.9.6 is invoked directly). The 9 failures are documented as KG-1 in §7.

---

## 2. F1 (Medium) — DB-free repository tests — **CLOSED / PASS**

### 2.1 Required coverage map

| T6 requirement | Test(s) in the new specs | Assertion strength |
|---|---|---|
| `findByEmail` → `null` when user missing | `prisma-users.repository.spec.ts` — "returns null when the user does not exist" | returns `null` |
| `findByEmail` → `null` when credential missing | "returns null when the user has no credential row" | returns `null` |
| `findByEmail` → `null` when `passwordHash` is `null` | "returns null when the credential has no password hash (invited account)" | returns `null` |
| Lowercase + trim lookup | "lowercases and trims the email before querying" | exact query: `where: { email: 'admin@rafconsult.test' }` from input `'  ADMIN@RafConsult.Test  '` |
| `findById` mapping | "queries by id and maps the record to the domain type"; "returns null when the user does not exist" | exact query `{ where: { id } }`, full mapped object |
| `create` nested credential + mapping | "creates the credential in a nested write and maps the result" | exact `data` object incl. nested `credential.create`, normalised email/trimmed name, `passwordUpdatedAt: expect.any(Date)`, mapped result |
| `create` explicit `isActive` | "honours an explicit isActive flag" | `expect.objectContaining({ isActive: false })` |
| Session `create` | `prisma-sessions.repository.spec.ts` — "inserts the supplied id, user and expiry and maps the result" | exact `data` + mapped result |
| `findActiveById` unrevoked + unexpired | "queries only unrevoked, unexpired rows and maps the result" | **exact where shape**: `revokedAt: null`, `expiresAt: { gt: expect.any(Date) }`, exact id; mapped result |
| `findActiveById` no match | "returns null when no unrevoked, unexpired row matches" | returns `null` |
| `revoke` true when a row was updated | "returns true when a live row was updated" | exact `where: { id, revokedAt: null }` + `data: { revokedAt: expect.any(Date) }`; returns `true` |
| `revoke` false when already revoked/missing | "returns false when the row is already revoked or missing" | returns `false` on `count: 0` |

14 new tests (9 users + 5 sessions). Lint went 33 → 35 files because the two specs are colocated in `src/` and linted.

### 2.2 Are they more than "mock was called"? — Yes

- The specs assert the **exact query object** with `toHaveBeenCalledWith({...})`, not `toHaveBeenCalled()` or `expect.any(Object)`: lowercased/trimmed `where.email`, `include: { credential: true }`, `where: { id }`, nested `credential.create`, `revokedAt: null`, `expiresAt: { gt: Date }`, `updateMany` `where` + `data`.
- They also assert **return values/mapping** (full `toEqual` objects) and the `null` branches, not only that Prisma was invoked.
- They use a small hand-written typed mock; the only cast is `prisma as unknown as PrismaService` at the constructor seam (documented in the specs). No `any`, `@ts-ignore` or `@ts-expect-error`; no `PrismaClient` import; no DB or network.
- Limitation (by design): a mocked client cannot prove real SQL/Prisma filtering; the query-shape assertion is the correct DB-free contract check. Real-DB behaviour remains `DEFERRED (no DB)` (§8).

### 2.3 Mutation check — do the tests fail if the repository logic is inverted?

Method: a throwaway copy of `src/`, `test/`, configs and `package.json` was made under `/tmp` with `node_modules` and `src/generated` symlinked; the copy was mutated with `sed`; the relevant spec was run; the copy was discarded. **The original source was never edited** — its combined sha256 was `643b7762d30ba25b6b02692d573336e8fdfca9cc94fcba18915491c20f6beff3` before and after the run.

| # | Mutation (throwaway copy only) | Tests failing | Caught? |
|---|---|---|---|
| 1 | `users` — remove email normalisation (`where.email` raw) | "lowercases and trims the email before querying" | **YES** |
| 2 | `users` — drop `include: { credential: true }` | "queries by email with the credential relation…", "lowercases and trims…" | **YES** |
| 3 | `users` — drop the null-`passwordHash` guard | "returns null when the user has no credential row", "returns null when the credential has no password hash…" | **YES** |
| 4 | `users` — return the raw record from `findById` (no mapping) | "queries by id and maps the record to the domain type" | **YES** |
| 5 | `users` — `create` without the nested `credential` write | "creates the credential in a nested write and maps the result" | **YES** |
| 6 | `sessions` — invert `revokedAt: null` → `{ not: null }` | "queries only unrevoked, unexpired rows and maps the result" | **YES** |
| 7 | `sessions` — invert expiry filter `gt` → `lt` | "queries only unrevoked, unexpired rows and maps the result" | **YES** |
| 8 | `sessions` — invert `revoke` return (`count > 0` → `count === 0`) | "returns true when a live row was updated", "returns false when the row is already revoked or missing" | **YES** |

Baseline in the copy before mutations: 14/14 passed. **8/8 mutations were caught**, including both query-shape and return-value/logic inversions. The new tests are effective, not tautological.

**F1 verdict: PASS.**

---

## 3. F2 (Low) — generated-client format/coverage boundaries — **CLOSED / PASS**

- `backend/app/.prettierignore` (new) contains `src/generated/`, `dist/`, `coverage/`.
- `vitest.config.ts` and `vitest.config.e2e.ts` both add `coverage.exclude` spreading `coverageConfigDefaults.exclude` plus `src/generated/**` and `dist/**` (kept in sync as the config comments state).
- Evidence that the boundaries actually work (not just that the files exist):
  - `npx prettier --check .` output contains **no** `generated`/`dist` path; the 9 reported files are all pre-existing source/test files.
  - `npx prettier --file-info src/generated/prisma/client.ts` → `{ "ignored": true }`; same for `dist/main.js` and `coverage/coverage-final.json`; a normal source file reports `"ignored": false`.
  - `npx prettier --check "src/generated/**/*.ts"` → `All matched files use Prettier code style!` (exit 0), i.e. an explicit glob does not drag generated files into formatting checks.
  - `npm run test:cov` report contains **0** `src/generated` / `dist` entries; `coverage/coverage-final.json` likewise has 0 matches.
- Closes T5 observation **OBS-4** ("no `.prettierignore`, so generated client is not excluded from Prettier").

**F2 verdict: PASS.**

---

## 4. F4 (Low) — seed hashing outside the transaction — **CLOSED / PASS** (DB run still deferred)

Static assertions against `prisma/seed.ts` (all true, see [`static-checks.log`](evidence/2026-11-09-t7/static-checks.log)):

- `prepareDemoUsers(password)` is awaited **before** `prisma.$transaction(...)`.
- `PasswordHasher.hash()` is called only inside `prepareDemoUsers`, i.e. outside the interactive-transaction callback.
- **5** hashes are precomputed (the five accounts with a password: admin, pm, worker, viewer, inactive); the invited account intentionally has none.
- The `$transaction` callback performs only DB writes (`tx.user.upsert` ×1 call site, `tx.credential.upsert` / `tx.credential.deleteMany`); no hashing remains inside it.
- `new PrismaClient()` is instantiated after hashing; no password/token is logged; production/`SEED_PASSWORD` guards unchanged.

This removes the 5 s interactive-transaction timeout risk from CPU-heavy argon2id work while keeping all DB writes in one transaction. **Executing the seed still needs a database → `DEFERRED (no DB)`** (§8); the static ordering is the verifiable part here.

**F4 verdict: PASS (static); DB execution deferred.**

---

## 5. Regression and scope checks

- **No behavior change outside tests/seed/config:** the only non-test/non-config source file touched by T6 is `src/users/prisma-users.repository.ts` — a **formatting-only** touch (the 5-line type import collapsed to one line; line numbers shift by exactly −4 versus the T4/T5 records, while `findByEmail` null guard, email normalisation, mapping, `findById` and nested-credential `create` are statement-for-statement identical). No logic changed. The sessions repository, `PrismaService`, `PrismaModule`, schema and migration were not touched by T6 (mtimes unchanged; schema/migration not in the T6 delta list).
- **T6 delta:** `prisma/seed.ts`, `vitest.config.ts`, `vitest.config.e2e.ts`, new `.prettierignore`, two new specs, plus the formatting-only users-repo touch — all inside T6's write scope. `package.json` is unchanged by T6 (its Prisma/scripts state is T1).
- **Shims untouched (T8 still pending):** `src/database/database.module.ts`, `src/users/postgres-users.repository.ts`, `src/sessions/postgres-sessions.repository.ts` all still exist with mtime 12:14:30 and original content; they are deliberately deferred to T8. No shim was removed or renamed here.
- **No `pg` reintroduced:** 0 matches for `from 'pg'`, `new Pool`, `DATABASE_POOL` in `src/`/`test/`/`prisma/`; no `pg`/`@types/pg` in `package.json` or the lockfile.
- **E2E unchanged:** 13/13, still in-memory overrides — a wiring result, not a database claim.
- **`git status`:** still only T1 + T6 paths under `backend/app/` plus QA's `docs/qa/` evidence/report; no out-of-scope path.

---

## 6. New defects

**None.** F1's requirement "if a new test is weak, call it out as a defect" does not apply: the specs assert query shape and return values, and 8/8 mutations were caught. The only imperfection is pre-existing formatting debt outside T6 (KG-1, below) and the by-design limits of mock-level tests (DB semantics deferred).

---

## 7. Known gaps and observations (non-blocking)

| ID | Area | Observation | Handling |
|---|---|---|---|
| **KG-1** | Formatting debt (pre-existing) | `npx prettier --check .` exits 1 on **9 files outside T6**: `src/app.setup.ts`, `src/auth/auth.controller.ts`, `src/auth/auth.module.ts`, `src/auth/auth.service.spec.ts`, `src/auth/auth.service.ts`, `src/auth/dto/login.dto.ts`, `src/auth/role-dashboard.spec.ts`, `test/auth.e2e-spec.ts`, `test/support/in-memory.repositories.ts`. They pre-date T1/T6 (`git status` for them is clean; none is in T6's write scope). | Recorded as **formatting debt, not a T6 failure / not a blocker**. Follow-up cleanup task recommended before the Day-9 freeze or as part of T8/via `npm run format` with `.prettierignore` in place. |
| KG-2 | Process note | T6 touched `src/users/prisma-users.repository.ts` for formatting only (line shift −4). | No action; logic verified identical. |
| KG-3 | DB-dependent checks | Prisma repositories against real PostgreSQL, seed execution, migration apply are still not runnable here. | `DEFERRED (no DB)` → CI/staging (§8). |
| KG-4 | E2E coverage | `npm run test:e2e` remains in-memory and still asserts the Phase-1 Bearer contract. | Expected: cookie transport is Phase 2. Not a T6 issue. |
| KG-5 | Prisma 7 readiness | `package.json#prisma` deprecation warning persists (carried from T5 OBS-5). | Sprint 2 task; not in T6 scope. |

---

## 8. Deferred register (`DEFERRED (no DB)`)

| Check | Why | Destination |
|---|---|---|
| Prisma repository runtime behaviour against PostgreSQL (the mocked specs prove query construction and mapping only) | No DB in sandbox | CI `api` job (Postgres service) |
| `prisma migrate deploy` (apply baseline migration) | No DB | CI / Railway pre-deploy |
| `prisma db seed` / `npm run db:setup` execution (hashing order is verified statically) | No DB | CI (test DB) / staging demo seed |
| `findByEmail`/session uniqueness and FK/cascade behaviour at the SQL layer | No DB | CI e2e (Day 6) |

None of these is reported as passed.

---

## 9. Verdict

**PASS.**

- **F1 (Medium): closed.** 14 new DB-free repository tests cover every required case, assert exact query shapes and return mappings (not just invocations), and **caught 8/8 injected logic inversions** in an independent mutation run.
- **F2 (Low): closed.** Generated client, `dist/` and `coverage/` are excluded from Prettier and coverage, verified by file-info, a full `prettier --check .` run, explicit globs, and the coverage data (0 generated/dist entries). T5 OBS-4 is resolved.
- **F4 (Low): closed statically.** Five argon2 hashes are computed before the interactive transaction; only DB writes remain inside it. Execution remains `DEFERRED (no DB)`.
- No new defects; no behavior change outside the allowed T6 paths; no `pg` reintroduced; shims intentionally remain for T8.
- Condition: the 9-file Prettier failure (KG-1) is pre-existing formatting debt outside T6 and must not be presented as green; DB-backed behaviour stays deferred to CI/staging.

---

## 10. Reproducibility

```bash
cd /home/anoshizuku/Projects/scaffold/backend/app
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:cov
npx prettier --check .
npx prettier --file-info src/generated/prisma/client.ts   # {"ignored": true}
```

Mutation run (independent, source never modified): copy `src test tsconfig.json vitest.config*.ts package.json` to a temporary directory, symlink `node_modules` and `src/generated`, apply one mutation with `sed`, run the relevant spec, discard the copy. The original `src/users/prisma-users.repository.ts` + `src/sessions/prisma-sessions.repository.ts` digest was identical before/after (`643b7762…`). Full mutation log: [`mutation-testing.log`](evidence/2026-11-09-t7/mutation-testing.log).

| Evidence artifact | Contents |
|---|---|
| [`evidence/2026-11-09-t7/lint.log`](evidence/2026-11-09-t7/lint.log) | 0 warnings, 35 files |
| [`evidence/2026-11-09-t7/unit-test.log`](evidence/2026-11-09-t7/unit-test.log) | 25/25 unit tests |
| [`evidence/2026-11-09-t7/build.log`](evidence/2026-11-09-t7/build.log) · [`build-artifact.txt`](evidence/2026-11-09-t7/build-artifact.txt) | build exit 0, ESM dist |
| [`evidence/2026-11-09-t7/e2e-test.log`](evidence/2026-11-09-t7/e2e-test.log) | 13/13 e2e (in-memory) |
| [`evidence/2026-11-09-t7/coverage.log`](evidence/2026-11-09-t7/coverage.log) | 25/25 + coverage table, no generated/dist |
| [`evidence/2026-11-09-t7/prettier-check.log`](evidence/2026-11-09-t7/prettier-check.log) · [`prettier-file-info.log`](evidence/2026-11-09-t7/prettier-file-info.log) | 9 pre-existing failures; generated/dist ignored |
| [`evidence/2026-11-09-t7/mutation-testing.log`](evidence/2026-11-09-t7/mutation-testing.log) | 8 mutations, 8 caught; source digest unchanged |
| [`evidence/2026-11-09-t7/static-checks.log`](evidence/2026-11-09-t7/static-checks.log) | F1/F2/F4 static assertions, no-pg, shims, T6 delta, scope |

Honesty checklist:

- [x] Every command in §1 was actually run in this environment; exit codes and key output recorded.
- [x] No DB-dependent check is claimed as passed; all are `DEFERRED (no DB)`.
- [x] The prettier check is reported as failing (9 pre-existing files), not as green.
- [x] Mutation testing was performed on a throwaway copy; original source unchanged (digest verified).
- [x] No password, JWT, cookie, reset token, or API key appears in this document or the evidence logs.
- [x] No source edits, installs, or Git writes were performed by QA.
