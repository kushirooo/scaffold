# Independent Verification — Local PostgreSQL Database

| Field | Value |
|---|---|
| Task | `task-11` — independent DB verification and QA record update (verifies T9 + T10) |
| Implemented by | `backend-dev` (T9: migrate/seed/API smoke; T10: real-Postgres suite) |
| Verified by | `qa-engineer` (independent reproduction) |
| Date / time | 2026-11-09 13:00–13:06 +08 (Asia/Kuala_Lumpur) |
| Repository | `scaffold` — branch `feat/prisma-foundation`, HEAD `789cc99`; T9/T10 delta uncommitted (Lead owns the commit) |
| Environment | Agent sandbox — **local PostgreSQL 18.6 accepting connections at 127.0.0.1:5432** (no Docker daemon is used); Node v26.13.0, npm 12.2.2, Prisma 6.19.3 |
| Databases | `raf_pms` (development, migrated + seeded) and `raf_pms_test` (dedicated test DB) |
| Verdict | **PASS** — DB-dependent checks that were `DEFERRED (no DB)` in T5/T7 are now verified locally; 0 defects; CI/staging runs and the unimplemented Phase-2 features remain out of scope |

**US01 update (T13, 9 Nov 2026):** the Phase-2 US01 API (cookie transport, CSRF, CORS, `tokenVersion`, D1 redirect) is now implemented and verified: target-contract HTTP e2e **22/22** against the live dev DB, live smoke **25/25**, unit **40/40**, boot validation and static checks pass. The "in-memory e2e" limitation recorded in §5 was true at T11 and is superseded locally. Full evidence: [`verification-us01-cookies.md`](verification-us01-cookies.md). The CI e2e run (throwaway DB) and staging cookie flags remain pending.

**What this PASS means:** the Prisma migration is applied to `raf_pms`, the seed produces the expected six demo accounts, the real-Postgres suite (`npm run test:db`, 22 tests) passes against `raf_pms_test` with a working dev-DB guard and no false-pass path, and the Phase-1 Bearer API works against the real database. **What it does not mean:** the cookie/CSRF reconciliation, email and reset features are still not implemented (AC matrix statuses are unchanged), the CI job has not run this, and staging does not exist. Those limits are listed in §5.

Raw outputs: [`docs/qa/evidence/2026-11-09-t11/`](evidence/2026-11-09-t11/). No seed password or JWT was printed during this verification; the smoke extracted the token into a shell variable only and the evidence logs were scanned for credential strings.

---

## 1. Commands and results

Run from `/home/anoshizuku/Projects/scaffold/backend/app` unless stated.

| # | Command | Exit | Result | Evidence |
|---|---|---|---|---|
| 1 | `pg_isready -h 127.0.0.1 -p 5432` | 0 | `127.0.0.1:5432 - accepting connections` (PostgreSQL 18.6; `psql` 18.6) | [`versions.log`](evidence/2026-11-09-t11/versions.log) |
| 2 | `npx prisma migrate status` | 0 | `Datasource "db": PostgreSQL database "raf_pms" …` · `1 migration found` · `Database schema is up to date!` | [`migrate-status.log`](evidence/2026-11-09-t11/migrate-status.log) |
| 3 | `psql "$DATABASE_URL"` state queries (users/credentials/schema) | 0 | 6 users, 5 credentials, invited has none, `token_version` present, enums present, reset-token table present | [`raf_pms-state.log`](evidence/2026-11-09-t11/raf_pms-state.log) |
| 4 | `npm run test:db` | 0 | `Test Files 4 passed (4)` · `Tests 22 passed (22)`; log shows `Datasource "db": … "raf_pms_test" at 127.0.0.1:5432` and `migrate deploy` via global setup | [`test-db.log`](evidence/2026-11-09-t11/test-db.log) |
| 5 | Guard: `TEST_DATABASE_URL=<dev raf_pms URL> npm run test:db` | **1** | `Error: Refusing to run DB tests against the development database "raf_pms"…` — suite aborts, no tests run | [`test-db-guard-full.log`](evidence/2026-11-09-t11/test-db-guard-full.log) |
| 6 | No-false-pass: `TEST_DATABASE_URL=postgresql://…:5999/raf_pms_test npm run test:db` | **1** | `Error: Failed to apply Prisma migrations to the test database (raf_pms_test at 127.0.0.1:5999)` — global setup aborts before any test | [`test-db-no-false-pass.log`](evidence/2026-11-09-t11/test-db-no-false-pass.log) |
| 7 | DB-backed API smoke on `127.0.0.1:4000` (Phase-1 Bearer) | 0 | `RESULT: PASS (13/13 checks)` — details in §1.2 | [`api-smoke.log`](evidence/2026-11-09-t11/api-smoke.log) |
| 8 | `npm run lint` / `npm test` / `npm run test:e2e` / `npm run build` | 0 / 0 / 0 / 0 | lint `0 warnings, 0 errors` on **42 files**; unit **25/25** (6 files); e2e **13/13** (2 files); build exit 0, ESM `dist/main.js` | [`green-checks.log`](evidence/2026-11-09-t11/green-checks.log), [`lint.log`](evidence/2026-11-09-t11/lint.log), [`unit-test.log`](evidence/2026-11-09-t11/unit-test.log), [`e2e-test.log`](evidence/2026-11-09-t11/e2e-test.log), [`build.log`](evidence/2026-11-09-t11/build.log) |
| 9 | `psql` re-check after the DB suite and smoke | 0 | `raf_pms` still **6 users**; pm sessions: 0 unrevoked / 2 revoked (one pre-existing from T9, one created+revoked by this smoke) | [`raf_pms-state.log`](evidence/2026-11-09-t11/raf_pms-state.log), [`post-smoke-state.log`](evidence/2026-11-09-t11/post-smoke-state.log) |

### 1.1 `raf_pms` state after T9's migrate + seed (T10 did not touch it)

| Email | Role | Active | Password hash | `token_version` |
|---|---|---|---|---|
| `admin@rafconsult.test` | `ADMIN` | true | yes | 0 |
| `inactive@rafconsult.test` | `WORKER` | **false** | yes | 0 |
| `invited@rafconsult.test` | `WORKER` | true | **no (no credential row)** | 0 |
| `pm@rafconsult.test` | `PROJECT_MANAGER` | true | yes | 0 |
| `viewer@rafconsult.test` | `VIEWER` | true | yes | 0 |
| `worker@rafconsult.test` | `WORKER` | true | yes | 0 |

`users` = 6, `credentials` = 5, `password_reset_tokens` = 0, `_prisma_migrations` finished = 1. Schema: `users.token_version` is `integer NOT NULL DEFAULT 0`, `is_active` is `boolean NOT NULL DEFAULT true`; both enums have the locked values; `password_reset_tokens` exists.

### 1.2 DB-backed API smoke (real `raf_pms`, Phase-1 Bearer contract)

| Check | Result |
|---|---|
| `POST /auth/login` pm | `200`; `role=PROJECT_MANAGER`, `redirectTo=/dashboard/projects`, `tokenType=Bearer`, `expiresIn=3600`, 3-part JWT in body, no `passwordHash` |
| Session row created in DB | pm unrevoked sessions `0 → 1` |
| `GET /auth/me` with token | `200`; `email=pm@rafconsult.test`, `role=PROJECT_MANAGER`, no `passwordHash` |
| `GET /auth/me` without token | `401` |
| `POST /auth/logout` | `204`; pm unrevoked sessions `1 → 0`, revoked `1 → 2` |
| `GET /auth/me` with pre-logout token | `401` |
| `invited@` login | `401` |
| `inactive@` login | `401` |
| invited vs inactive response bodies | **byte-identical** |
| generic message | `Invalid email or password` |

The API server was started from the built `dist/main.js` on port 4000 and stopped afterwards (port confirmed closed). This is the current Phase-1 Bearer surface; cookies/CSRF are Phase 2 and are not claimed here.

---

## 2. Real-Postgres suite inspection (`npm run test:db`)

### 2.1 Configuration and isolation

- `vitest.config.db.ts`: includes `test/db/**/*.db-spec.ts`, `globalSetup: ['./test/db/global-setup.ts']`, `fileParallelism: false` (one shared DB, no interleaving).
- **Uses `raf_pms_test`, not `raf_pms`:** `resolveTestDatabaseUrl()` reads `TEST_DATABASE_URL` or defaults to `postgresql://…@127.0.0.1:5432/raf_pms_test`; it throws if the database name is `raf_pms`. `globalSetup` overrides `DATABASE_URL` with the resolved test URL when invoking `prisma migrate deploy`, so Prisma cannot migrate the dev DB. The run log confirms the datasource is `raf_pms_test` at `127.0.0.1:5432`.
- **Migrations in global setup:** `prisma migrate deploy` runs once per suite; any failure throws and aborts the run (`test-db-no-false-pass.log` proves the abort path).
- **FK-safe truncation:** `resetTestDatabase()` issues one `TRUNCATE TABLE "password_reset_tokens", "sessions", "credentials", "users" RESTART IDENTITY CASCADE`; every DB spec calls it in `beforeEach`. CASCADE plus a single statement makes the order safe; no per-table deletes and no `migrate reset`.
- **Real DB only:** `test/db/` imports `createTestPrismaService` (a real `PrismaService`); grep finds no `InMemory*`, `vi.fn`, or `vi.mock` in the suite.

### 2.2 File/test inventory (22 tests)

| Spec | Tests | What it asserts against real PostgreSQL |
|---|---|---|
| `test/db/users.repository.db-spec.ts` | 9 | `findByEmail` mapped row incl. stored hash; lowercased/trimmed lookup; `null` for unknown email, missing credential and `passwordHash: null`; `findById` mapping/null; `create` writes user + nested credential **persisted** (re-read with `include.credential`); duplicate create rejects `P2002` and leaves exactly 1 user + 1 credential (no orphan) |
| `test/db/sessions.repository.db-spec.ts` | 6 | `create` persisted row (re-read); `findActiveById` returns valid row, `null` for revoked, `null` for expired (`pastDate`); `revoke` true-then-false with persisted `revokedAt` asserted; unknown id `false` |
| `test/db/schema.db-spec.ts` | 5 | catalog assertions: `token_version` integer/non-null/default `0`; both enums and values; duplicate `token_hash` → `P2002`; all three FKs `confdeltype = 'c'` (cascade); deleting a user removes credential/session/reset-token rows (counts 1→0) |
| `test/db/seed.db-spec.ts` | 2 | seeding twice leaves exactly the six expected accounts; one argon2id credential per password account (5), `invited@` has no credential; every hash matches `^\$argon2id\$` and verifies with `SEED_PASSWORD` |

### 2.3 Do the tests assert real rows/DB state, or only mock calls?

They assert **real persisted state**: every successful write is re-read through Prisma (`findUnique`/`count`), and the failures are asserted through database behaviour (`P2002`, cascade counts, `revoked_at` persisted, `information_schema`/`pg_catalog` queries). There are **no mock-call assertions** in `test/db/` — it is a real-DB suite, not a mocked one. The earlier T6 mocked specs remain the query-shape tests for DB-free runs; the two layers complement each other.

**Weak-assertion review:** no test was found that merely checks "a call happened". The weakest spots are by design, not defects:

- The session `create` test asserts `id: expect.any(String)` rather than the supplied id; the persisted re-read covers the row identity, so this is adequate.
- Schema tests pin Prisma's generated catalog/DDL shape (`column_default = '0'`, enum labels, `confdeltype = 'c'`); they will correctly fail if the migration changes.
- Seed tests assert five hashes verify against the test-only password and that `invited@` has no credential; they do not revoke/expire unrelated tables (out of scope).

**No-false-pass claim:** holds. Global setup applies migrations and aborts the whole run if they cannot be applied (verified with an unreachable DB → exit 1, no tests); tests assert persisted state, so a missing/incorrect schema fails; the guard prevents accidental truncation of `raf_pms` (verified → exit 1). One nuance: `prisma migrate deploy` **created** a missing database during a probe (`qa_absent_db_do_not_create`) and then applied migrations, so a clean but nonexistent test DB is not automatically an error — see OBS-1. The stray probe DB was dropped immediately; no app database was changed.

---

## 3. Defects

**None.** The DB foundation behaves as designed; migration status, seed contents, real-DB repository/schema/seed tests and the DB-backed API smoke all pass. The guard and global-setup failure paths behave correctly.

---

## 4. Observations and known gaps (non-blocking)

| ID | Area | Observation | Handling |
|---|---|---|---|
| OBS-1 | Test-DB provisioning | In the probe, `prisma migrate deploy` **auto-created** a missing database and applied migrations (Prisma 6.19.3). This is helpful but should not be relied on as the CI provisioning step. | CI/staging should create `raf_pms_test` explicitly and set `TEST_DATABASE_URL`; the suite still aborts if migrations cannot be applied. |
| OBS-2 | Dev data touched by smoke | The API smoke added one auth session row to `raf_pms` (revoked at logout); users/credentials are unchanged (6/5). T9 had already left one revoked session. | Expected for a DB-backed smoke; no user data changed. Staging/demo data may be reseeded before the review if desired. |
| OBS-3 | Coverage level | `test:db` covers repositories, schema and seed against real Postgres; it does **not** drive HTTP endpoints. The HTTP e2e suite is still in-memory (`13/13` wiring) and the Phase-2 cookie/CSRF features are not implemented. | Phase 2 adds DB-backed HTTP e2e in CI (plan §14); the smoke above covers the Phase-1 contract manually. |
| OBS-4 | CI prerequisite | The CI `api` job currently has no `raf_pms_test` creation step or `test:db` invocation (plan §14 predates T10). | Add `createdb`/service DB and `npm run test:db` to the CI job in the CI task; until then, `test:db` is local-only. |
| OBS-5 | Known schema gaps (carried) | F5 (`updated_at` has no DB default; Prisma is the only writer) and F7 (email uniqueness is app-normalised, no `CHECK (email = lower())`) are unchanged. | Documented in the T4 review; not introduced by T9/T10, not blockers. |
| OBS-6 | Prisma 7 readiness | `package.json#prisma` deprecation warning persists on every Prisma command. | Sprint 2 task; not in T9/T10 scope. |

---

## 5. Remaining limits (honest scope)

1. **Features are still not implemented.** US01 cookie/CSRF transport, US18 email and US19 reset endpoints are Phase 2–4. The [AC matrix](ac-matrix.md) AC rows remain `not yet implemented`; nothing in this document changes an AC status.
2. **In-memory e2e is still in-memory.** `npm run test:e2e` (13/13) uses repository overrides and asserts the Phase-1 Bearer contract; it is not a database test. `npm run test:db` is the real-DB suite.
3. **CI has not run this.** All results are local. CI must add a Postgres service/database (`raf_pms_test`) and a `test:db` step (OBS-4). CI is authoritative for Node 24.
4. **Staging remains `DEFERRED (no staging)`.** The staging smoke script and DoD staging validation still cannot run.
5. **No schema change was made.** This task only ran migrations/seed/queries and added tests (T10) plus QA docs; the migration and schema are untouched.

---

## 6. Verdict

**PASS** — local database verification.

- `raf_pms` is on the committed migration and seeded with exactly the six expected accounts; the invited account has no credential; schema invariants are present.
- `npm run test:db` passes **22/22** against `raf_pms_test`, with migrations applied in global setup, FK-safe truncation, and real-row/DB-state assertions (no mocks).
- The dev-DB guard refuses `raf_pms` (exit 1) and an unreachable DB aborts the suite before tests (exit 1): no false pass.
- The Phase-1 Bearer API works against the real DB: login 200, `/auth/me` 200, logout 204 with the session row revoked, old token 401, invited/inactive identical generic 401 (13/13 smoke checks).
- `lint` (42 files, 0/0), `test` (25/25), `test:e2e` (13/13) and `build` stay green.
- Conditions: CI must provision `raf_pms_test` and run `test:db`; Phase-2 features and staging checks remain deferred. The 0-defect verdict applies to the DB foundation, not to the unimplemented ACs.

---

## 7. Reproducibility

```bash
cd /home/anoshizuku/Projects/scaffold/backend/app
pg_isready -h 127.0.0.1 -p 5432
npx prisma migrate status
npm run test:db
TEST_DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)" npm run test:db   # must refuse
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5999/raf_pms_test' npm run test:db  # must abort
npm run lint && npm test && npm run test:e2e && npm run build
# API smoke: start node dist/main.js, then POST /auth/login, GET /auth/me, POST /auth/logout,
# GET /auth/me with the old token; do not print the SEED_PASSWORD or the JWT.
```

Prerequisites: local PostgreSQL 18.6 on `127.0.0.1:5432`; `raf_pms` migrated and seeded (T9); `raf_pms_test` present (T10) and reachable via `TEST_DATABASE_URL` or the default. No installs and no schema changes were performed.

| Evidence artifact | Contents |
|---|---|
| [`versions.log`](evidence/2026-11-09-t11/versions.log) | node/npm/psql/pg_isready/Prisma versions |
| [`migrate-status.log`](evidence/2026-11-09-t11/migrate-status.log) | `raf_pms` migration status |
| [`raf_pms-state.log`](evidence/2026-11-09-t11/raf_pms-state.log) | six users, roles/states, credentials, schema invariants |
| [`test-db.log`](evidence/2026-11-09-t11/test-db.log) | 22/22 real-Postgres suite |
| [`test-db-guard-full.log`](evidence/2026-11-09-t11/test-db-guard-full.log) | dev-DB refusal |
| [`test-db-no-false-pass.log`](evidence/2026-11-09-t11/test-db-no-false-pass.log) | migration-failure abort |
| [`api-smoke.log`](evidence/2026-11-09-t11/api-smoke.log) | 13/13 DB-backed API smoke (no secrets) |
| [`green-checks.log`](evidence/2026-11-09-t11/green-checks.log) · [`lint.log`](evidence/2026-11-09-t11/lint.log) · [`unit-test.log`](evidence/2026-11-09-t11/unit-test.log) · [`e2e-test.log`](evidence/2026-11-09-t11/e2e-test.log) · [`build.log`](evidence/2026-11-09-t11/build.log) | lint/unit/e2e/build |
| [`post-smoke-state.log`](evidence/2026-11-09-t11/post-smoke-state.log) | server stopped, `raf_pms` still 6 users, no secrets in logs |
| [`git-status.log`](evidence/2026-11-09-t11/git-status.log) | scope snapshot (T9/T10 delta + QA docs) |

Honesty checklist:

- [x] Every command/result above was actually run in this environment; exit codes and key output recorded.
- [x] No seed password or JWT is printed in this document or the evidence logs (scanned; token held in a shell variable only).
- [x] In-memory e2e is described as in-memory; `test:db` is described as the real-DB suite.
- [x] No AC matrix row was marked passing — the features remain unimplemented.
- [x] CI and staging limits are stated, not hidden.
- [x] No source edits, installs, Git writes, or schema changes were performed by QA; the stray probe database created by the migrate-deploy probe was dropped.
