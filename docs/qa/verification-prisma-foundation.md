# Independent Verification — T1 Prisma Foundation

| Field | Value |
|---|---|
| Task | `task-5` — independent verification of `task-1` (T1 Prisma foundation) |
| Implemented by | `backend-dev` |
| Verified by | `qa-engineer` (independent reproduction; not from the implementation report) |
| Date / time | 2026-11-09 12:18–12:20 +08 (Asia/Kuala_Lumpur) |
| Repository | `scaffold` — branch `feat/prisma-foundation`, HEAD `a26c73e`; T1 changes are **uncommitted in the working tree** (Lead owns the commit) |
| Environment | Agent sandbox — **no Docker daemon, no PostgreSQL server**; Node v26.13.0, npm 12.2.2; CI target is Node 24 |
| Prisma | CLI 6.19.3 · `@prisma/client` 6.19.3 · binary target `debian-openssl-3.0.x` |
| Database | **None available.** Every DB-dependent check is `DEFERRED (no DB)` — see §6 |
| Verdict | **PASS** — all runnable acceptance commands pass; one deliverable is verified by static evidence because no DB exists; six non-blocking P3 observations; no defects |

**What this PASS means:** the T1 deliverables are present, wired, and reproduced from a clean command run. **What it does not mean:** the migration was not applied, the seed was not executed, and the Prisma repositories were not exercised against a real PostgreSQL database. Those are deferred to CI/staging (§6) and are not claimed.

Method: commands were run directly from `scaffold/backend/app` after the backend agent stopped installing/generating. No `npm install`, no source edits, no Git writes, no database connection. Raw outputs are in [`docs/qa/evidence/2026-11-09-t5/`](evidence/2026-11-09-t5/).

---

## 1. Commands and results

All commands were run from `/home/anoshizuku/Projects/scaffold/backend/app`.

| # | Command | Exit | Result (verbatim key lines) | Evidence |
|---|---|---|---|---|
| 1 | `npx prisma validate` | 0 | `Environment variables loaded from .env` · `Prisma schema loaded from prisma/schema.prisma` · `The schema at prisma/schema.prisma is valid 🚀` | [`validate.log`](evidence/2026-11-09-t5/validate.log) |
| 2 | `npx prisma generate` | 0 | `✔ Generated Prisma Client (6.19.3) to ./src/generated/prisma in 52ms` | [`generate.log`](evidence/2026-11-09-t5/generate.log) |
| 3 | `npm run lint` | 0 | `Found 0 warnings and 0 errors.` · `Finished in 24ms on 33 files with 96 rules` | [`lint.log`](evidence/2026-11-09-t5/lint.log) |
| 4 | `npm test` | 0 | `Test Files 4 passed (4)` · `Tests 11 passed (11)` (`role-dashboard` 2, `password-hasher` 3, `app.controller` 1, `auth.service` 5) | [`unit-test.log`](evidence/2026-11-09-t5/unit-test.log) |
| 5 | `npm run build` | 0 | `nest build` completed; `dist/main.js` created (540 bytes, ESM `import` output) | [`build.log`](evidence/2026-11-09-t5/build.log), [`build-artifact.txt`](evidence/2026-11-09-t5/build-artifact.txt) |
| 6 | `npm run test:e2e` | 0 | `Test Files 2 passed (2)` · `Tests 13 passed (13)` (`app.e2e-spec` 1, `auth.e2e-spec` 12) — **in-memory repositories, no DB** | [`e2e-test.log`](evidence/2026-11-09-t5/e2e-test.log) |
| 7 | `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` | 0 | 2706-byte SQL; `cmp` against committed migration → **IDENTICAL**; sha256 `c86d0b54b1b11d262abd5f72137db0696e2426ed3c3290a7c1c69067b361e7a6` for both | [`migrate-diff.sql`](evidence/2026-11-09-t5/migrate-diff.sql), [`migrate-diff.err`](evidence/2026-11-09-t5/migrate-diff.err) |
| 8 | schema-vs-plan normalised comparison (Python, structural lines) | 0 | `plan structural lines: 65, actual: 65` · `RESULT: schema is structurally identical to plan §18.1 (attribute order normalised)` | this doc §2.1 |
| 9 | `git status --short` / `git diff --stat` (read-only) | 0 | 16 T1 paths, all inside `task-1` write scope; no out-of-scope path; QA adds only `docs/qa/evidence/` | this doc §2.8 |

**Warnings observed (non-blocking):** `package.json#prisma` is deprecated and will be removed in Prisma 7 — see OBS-5. `npx prisma` prints `npm notice run …`; harmless.

---

## 2. Static checks

### 2.1 Schema matches plan §18.1 — PASS

Both files were normalised (comments/blank lines removed, field attribute order sorted) and compared: **65 structural lines each, identical**. The only textual differences are cosmetic attribute order, e.g. `@id @map("user_id") @db.Uuid` vs `@id @db.Uuid @map("user_id")` — semantically identical in Prisma.

| Element | Required (plan §18.1) | Actual (`prisma/schema.prisma`) | Result |
|---|---|---|---|
| Generator | `prisma-client`, output `../src/generated/prisma`, `moduleFormat = "esm"` | same | PASS |
| Datasource | postgresql, `env("DATABASE_URL")` | same | PASS |
| Enums | `UserRole` (4 values), `ResetTokenPurpose` (INVITE, RESET) | same | PASS |
| `User` | UUID PK, unique email, `fullName`, `role`, `isActive` default true, `tokenVersion` default 0 (line 32), timestamps `timestamptz(6)`, relations, `@@index([role])`, `@@map("users")` | same | PASS |
| `Credential` | `userId` UUID PK, **nullable** `passwordHash` (line 46) and `passwordUpdatedAt`, cascade FK, `@@map("credentials")` | same | PASS |
| `Session` | UUID PK, `userId`, timestamps, **nullable** `revokedAt` (line 58), cascade, indexes on `userId`/`expiresAt`, `@@map("sessions")` | same | PASS |
| `PasswordResetToken` | UUID PK, unique `tokenHash` (line 69), `purpose` enum, timestamps, nullable `usedAt`, cascade, indexes `[userId, purpose]`/`expiresAt`, `@@map("password_reset_tokens")` | same | PASS |

### 2.2 Migration SQL exists and corresponds to the schema — PASS (static); apply DEFERRED (no DB)

- File: `prisma/migrations/20261109041339_init_auth_schema/migration.sql` (86 lines, 2706 bytes), `migration_lock.toml` with `provider = "postgresql"`.
- **Byte-identical** to a fresh `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` run in this session (`cmp` exit 0; matching sha256, §1 row 7). This proves the committed SQL was generated from the committed schema and **not hand-edited or incomplete**.
- Structural inventory: 2 `CREATE TYPE`, 4 `CREATE TABLE`, 7 index statements (5 plain + 2 unique index statements incl. `users_email_key` / `password_reset_tokens_token_hash_key`), 3 `FOREIGN KEY` constraints, all 3 `ON DELETE CASCADE`.
- Nullability matches the invariants: `password_hash TEXT`, `password_updated_at`, `revoked_at`, `used_at` are nullable; `token_version INTEGER NOT NULL DEFAULT 0`.
- No `DROP`, `TRUNCATE` or `ALTER COLUMN` (fresh baseline migration; no destructive statement).
- Migration SQL folder timestamp `20261109041339` and `migration_lock.toml` are committed-ready.
- **Apply not claimed:** `prisma migrate deploy` cannot run without a Postgres service → `DEFERRED (no DB)`.

### 2.3 Seed — PASS (static); execution DEFERRED (no DB)

`prisma/seed.ts` statically parsed; six demo accounts, matching plan §18.4:

| Email | Role | Active | Password seeded |
|---|---|---|---|
| `admin@rafconsult.test` | `ADMIN` | true | yes |
| `pm@rafconsult.test` | `PROJECT_MANAGER` | true | yes |
| `worker@rafconsult.test` | `WORKER` | true | yes |
| `viewer@rafconsult.test` | `VIEWER` | true | yes |
| `inactive@rafconsult.test` | `WORKER` | false | yes (so login is rejected by state, not by a missing hash) |
| `invited@rafconsult.test` | `WORKER` | true | **no** — credential row deleted, exercises the no-password path |

Other seed properties: upsert is wrapped in `prisma.$transaction`; the invited account's credential is deleted (`deleteMany`) so no password is left behind; production guard `NODE_ENV === 'production'` requires `ALLOW_DEMO_SEED=true`; `SEED_PASSWORD` must be ≥12 characters; `PrismaClient` is disconnected in `finally`; failure sets `process.exitCode = 1`; no password/token is logged. It imports `PasswordHasher` (line 2) rather than the constant — see OBS-1.

**Execution (`npm run db:setup` / `prisma db seed`) is `DEFERRED (no DB)`.**

### 2.4 Custom runner removed; no `pg` pool — PASS

- `src/database/migrations.ts`, `src/database/migrate.ts`, `src/database/seed.ts` are **absent from the working tree** (`git status` shows them deleted; `ls` confirms no such files).
- `src/database/` retains only a documented compatibility shim `database.module.ts` that re-exports `PrismaModule as DatabaseModule` (line 8) so the Phase-2-owned `AuthModule` keeps compiling — see OBS-3.
- `src/sessions/postgres-sessions.repository.ts` and `src/users/postgres-users.repository.ts` are likewise documented re-export shims to the Prisma implementations; no `pg` code remains.
- Grep over `src/`, `test/`, `prisma/` for `from 'pg'`, `new Pool`, `pg.Pool`, `DATABASE_POOL` → **none**.
- `package.json` no longer declares `pg` or `@types/pg`; `package-lock.json` contains **0** `pg` references. The old `app.module.ts` `Pool` skip-instrumentation was replaced with `PrismaService` (verified in the diff).

### 2.5 Generated client boundaries — PASS (one P3 observation)

- `git ls-files src/generated` → **0 tracked files**; `git check-ignore -v src/generated/prisma/client.ts` → `backend/app/.gitignore:16:/src/generated/` (ignored). Root `.gitignore` also ignores `**/src/generated/`.
- Lint exclusion works: oxlint reports **33 files**; the tree contains 45 `.ts` files under `src`+`test` and 12 under `src/generated` → 33 = 45 − 12, i.e. generated code is excluded. `package.json` lint script carries `--ignore-pattern="src/generated/**"`.
- Generated client is inside the TypeScript build: `tsconfig.build.json` `include: ["src"]` and the build compiles the imports (`dist/generated/prisma/...` emitted); `nest build` passes.
- `.prettierignore` is absent, so Prettier is not excluded from generated code (plan §18.3 step 6 mentions it). Formatting is not a gate and no generated file is committed → OBS-4.

### 2.6 Package scripts and version pins — PASS

- Scripts present: `postinstall: prisma generate`, `db:generate`, `db:validate`, `db:migrate: prisma migrate deploy`, `db:migrate:dev`, `db:seed: prisma db seed`, `db:reset`, `db:setup`. This matches plan §18.3 (`migrate deploy` for CI/staging, `migrate dev` only for developers) and removes the old `nest build && node dist/database/...` commands.
- `prisma.seed: "tsx prisma/seed.ts"` configured; `tsx` added as a dev dependency.
- Prisma pinned exactly: `"prisma": "6.19.3"`, `"@prisma/client": "6.19.3"`; lockfile updated.
- `package.json#prisma` is deprecated for Prisma 7 (warning) — OBS-5.

### 2.7 Secrets — PASS with one P3 observation

- `.env` is ignored (`git check-ignore` → `backend/app/.gitignore:4:.env`) and **not tracked**. Only `.env.example` is tracked.
- The real `JWT_SECRET` value from `.env` is **not present in any tracked file** (value scanned with `git grep -F`, value not printed).
- `.env`'s `DATABASE_URL` and `SEED_PASSWORD` equal the documented `.env.example` development defaults (local compose URL / demo seed password) — not production secrets, but they are credentials in a tracked example file → OBS-2.
- Seed and tests contain no real tokens/passwords; the test suite uses an in-memory fixture password and the hermetic `EMAIL_TRANSPORT` concern does not apply to T1.
- The evidence logs contain no credential values (scanned).

### 2.8 Scope discipline — PASS

`git status --short` at verification time (before this report file was created) shows **16 T1 paths + QA's own evidence directory**. All 16 map to `task-1` write scopes; the scope-mapping script reports `out-of-scope: NONE`. `src/auth/**`, the repository interfaces (`users.repository.ts`, `sessions.repository.ts`) and `test/**` are untouched (`git status` for those paths is empty), matching T1's "do not edit AuthService" constraint.

Abbreviated snapshot (all paths under `backend/app/` except `docs/qa/`):

```text
 M .env.example                     (T1 scope)
 M .gitignore                       (T1 scope)
 M package-lock.json                (T1 scope)
 M package.json                     (T1 scope)
 M src/app.module.ts                (T1 scope)
 M src/database/database.module.ts  (T1 scope)
 D src/database/migrate.ts          (T1 scope)
 D src/database/migrations.ts       (T1 scope)
 D src/database/seed.ts             (T1 scope)
 M src/sessions/postgres-sessions.repository.ts (T1 scope)
 M src/users/postgres-users.repository.ts       (T1 scope)
 M tsconfig.build.json              (T1 scope)
?? prisma/                          (T1 scope)
?? src/prisma/                      (T1 scope)
?? src/sessions/prisma-sessions.repository.ts  (T1 scope)
?? src/users/prisma-users.repository.ts        (T1 scope)
?? docs/qa/evidence/                (T5, QA scope)
```

The same scan shows T1 did **not** smuggle in cookie transport, CSRF, email or reset work: no `src/auth/**`, `src/email/**`, `src/accounts/**` changes, and `package.json` adds only Prisma/`tsx`/script changes.

### 2.9 ESM and boot — PASS

- `package.json` has `"type": "module"`; generator uses `moduleFormat = "esm"`; `npm run build` emits ESM (`dist/main.js` starts with `import { … } from '@nestjs/config'`, `./app.module.js`).
- `npm run test:e2e` boots `AppModule` (which imports `PrismaModule`) and passes; `PrismaService` opens the connection lazily (commented in `src/prisma/prisma.service.ts`), so boot does not require a live DB.

### 2.10 E2E honesty check — 13/13, but not a database test

`test/auth.e2e-spec.ts` overrides `USERS_REPOSITORY` and `SESSIONS_REPOSITORY` with `InMemoryUsersRepository`/`InMemorySessionsRepository` from `test/support/in-memory.repositories.ts`; `test/app.e2e-spec.ts` only asserts `GET /`. No Prisma repository method is exercised against PostgreSQL. Therefore:

- The 13/13 result is valid for controller/guard/service wiring (and matches the backend's claim).
- It does **not** verify the Prisma implementations, the migration, or the seed. The e2e suite also still asserts the **Phase-1 Bearer contract** (`accessToken` in the body), which is expected — cookie transport is Phase 2 and out of T1 scope.
- DB-backed repository/migration/seed verification: `DEFERRED (no DB)` (§6).

---

## 3. Per-acceptance results (task-1)

| # | Acceptance item | Result | Basis |
|---|---|---|---|
| 1 | `npx prisma validate` passes | **PASS** | Command 1, exit 0 |
| 2 | `npx prisma generate` succeeds | **PASS** | Command 2, exit 0 |
| 3 | `npm run lint` passes | **PASS** | Command 3, 0 warnings/0 errors |
| 4 | `npm test` passes | **PASS** | Command 4, 11/11 — matches recorded 8 Nov baseline; no new skips |
| 5 | `npm run build` passes | **PASS** | Command 5, exit 0, `dist/main.js` |
| 6 | Migration SQL committed-ready, statically reviewed, **not claimed applied** | **PASS (static)** | §2.2; apply `DEFERRED (no DB)` |
| 7 | Only T1-scope files changed | **PASS** | §2.8, out-of-scope none |
| 8 | Deliverable: schema per plan §18.1 | **PASS** | §2.1, normalised identity |
| 9 | Deliverable: Prisma client/module/service; `DatabaseModule`/pg pool removed | **PASS with observation** | §2.4/2.5; pg gone, `DatabaseModule` compatibility alias remains — OBS-3 |
| 10 | Deliverable: repositories ported behind interfaces; `findByEmail` null for no password; `AuthService` untouched | **PASS** | `prisma-users.repository.ts:32–48` returns `null` when the credential or `passwordHash` is missing (lines 42–44); interfaces and `src/auth/**` untouched; `PRISMA` sessions repo preserves `findActiveById`/`revoke` semantics |
| 11 | Deliverable: custom runner deleted; migration produced via `migrate diff` | **PASS** | §2.2/2.4 |
| 12 | Deliverable: seed with six accounts + shared hasher; `db:*`/`postinstall` updated | **PASS with observation** | §2.3/2.6; single hash parameter set, seed uses `PasswordHasher` not the exported constant — OBS-1 |
| 13 | Deliverable: `.env.example` updated only if required; no secrets | **PASS with observation** | `.env` ignored, real JWT not tracked; demo defaults tracked — OBS-2 |
| 14 | Constraint: no cookie/CSRF/email/reset work in T1 | **PASS** | §2.8 |
| 15 | Constraint: no Git writes by agent, no DB/sudo | **PASS** | only read-only git + local commands; no DB connection attempted |
| 16 | E2E (Lead-requested): verify 13/13 yourself | **PASS, with DB caveat** | Command 6; in-memory harness only (§2.10) |

---

## 4. Defects

**None.** No acceptance failure, broken migration/schema correspondence, scope violation, secret leak, or build/test break was found. The T1 deliverable can proceed to the Lead's commit decision.

Findings are limited to the P3 observations below; none blocks T1 acceptance, the migration, or the Phase-2 start. The Lead/architect may reclassify them.

---

## 5. Observations (P3, non-blocking)

| ID | Area | File:line | Observation | Suggested action | Owner |
|---|---|---|---|---|---|
| OBS-1 | Seed / hasher | `prisma/seed.ts:2`, `src/auth/password-hasher.ts:8` | Plan §18.4 says seed should "import the exported constant"; the implementation imports `PasswordHasher`, and `HASH_OPTIONS` is module-private. The **intent** is met: grep shows the only argon2 parameter definition is `HASH_OPTIONS` in `password-hasher.ts`, and the seed hashes through that class — parameters are not duplicated. | If literal compliance is wanted, `export const HASH_OPTIONS` and import it in the seed (still using the shared hasher is fine too). | `backend-dev` / Lead adjudication |
| OBS-2 | Secrets hygiene | `.env.example:7,10,16` | Tracked `.env.example` contains the documented dev defaults: local compose `DATABASE_URL`, a non-secret JWT *placeholder*, and the demo `SEED_PASSWORD`. The real JWT secret is not tracked; these are fixtures, not production credentials. | Keep; never reuse the demo password in staging/production. CI uses its own dummy values (plan §14.2). | Lead |
| OBS-3 | Compatibility shims | `src/database/database.module.ts:8`, `src/sessions/postgres-sessions.repository.ts`, `src/users/postgres-users.repository.ts` | `DatabaseModule` and `Postgres*Repository` names still exist as documented re-export shims because T1 could not edit the Phase-2-owned `AuthModule`. No `pg` runtime remains. | Delete the shims when Phase 2 updates `AuthModule` providers. | `backend-dev` (Phase 2) |
| OBS-4 | Generated-client boundaries | repo root / backend app | No `.prettierignore`, so plan §18.3 step 6's "exclude from Prettier" is not implemented (lint and git are excluded correctly). Prettier is not a gate and no generated file is committed. | Add `.prettierignore` with `src/generated/` (and coverage exclude) when convenient. | `backend-dev` |
| OBS-5 | Prisma 7 readiness | `package.json:31` | `package.json#prisma` config is deprecated for Prisma 7; CLI prints the warning. Pinned 6.19.3 works. | Plan a `prisma.config.ts` migration in a later sprint; no action now. | `backend-dev` / architect |
| OBS-6 | Environment drift | toolchain | Local Node v26.13.0 vs CI Node 24 (plan §14.3). All commands passed here, but CI is authoritative. | Keep CI pinned to Node 24; do not use Node-26-only APIs. | Lead |

---

## 6. Deferred register — `DEFERRED (no DB)`

| Check | Why deferred | Destination | Verification owner |
|---|---|---|---|
| `npx prisma migrate deploy` (apply `20261109041339_init_auth_schema`) | No Docker/Postgres in sandbox | CI `api` job (Postgres 18 service), staging pre-deploy | `qa-engineer` in T5 follow-up / CI |
| `prisma migrate status` / migration idempotency on a real DB | No DB | CI | QA |
| `npm run db:setup` = migrate deploy + seed execution | No DB | CI (test DB), staging demo seed | QA |
| Prisma repositories against Postgres: `findByEmail` (incl. invited/no-password → null), `findById`, `create` with nested credential, session create/findActive/revoke, email unique + lowercase normalisation | No DB | CI e2e | QA |
| DB-state assertions for Phase 2+ (`sessions.revoked_at`, `token_version` bump, reset-token hash/TTL/used) | No DB | CI e2e | QA |
| Staging pre-deploy `migrate deploy` + `/health` DB check + demo seed | No staging | Railway staging | QA / Lead |
| A true DB-backed e2e run (current `test:e2e` is in-memory, §2.10) | No DB | CI `api` job | QA |

**None of these is claimed as passed.** The sandbox verdict covers only what ran here.

---

## 7. Verdict

**PASS.**

Justification: every runnable acceptance command was reproduced independently and passed (`prisma validate`, `prisma generate`, lint 0/0, unit 11/11, build, Prisma-ESM boot); the committed migration SQL is byte-for-byte identical to a fresh generation from the committed schema (sha256 match); the schema is structurally identical to plan §18.1; the seed statically matches the required six accounts and shares the single argon2 parameter set; the custom runner and `pg` dependency are gone; the generated client is untracked and lint-excluded but in the build; scripts/pins are correct; no out-of-scope file changed; no secret is tracked from `.env`.

Conditions attached to this verdict:

1. Database-dependent verification (apply, seed, repository integration, DB-backed e2e) is **`DEFERRED (no DB)`** and must run in CI/staging before the Phase-1 gate claims a working database layer.
2. The six P3 observations are non-blocking; OBS-1/OBS-3 are deliberate literal deviations with documented rationale and should be confirmed or scheduled by the Lead.
3. E2E 13/13 is a wiring result over in-memory repositories, not a database result.

---

## 8. Reproducibility

```bash
cd /home/anoshizuku/Projects/scaffold/backend/app
npx prisma validate
npx prisma generate
npm run lint
npm test
npm run build
npm run test:e2e
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
cmp prisma/migrations/20261109041339_init_auth_schema/migration.sql <(npx prisma migrate diff \
  --from-empty --to-schema-datamodel prisma/schema.prisma --script) && echo IDENTICAL
```

Prerequisites: `.env` present with `DATABASE_URL` (loaded by Prisma; **not connected**), dependencies already installed (no `npm install` was run), no Postgres/Docker needed for the commands above. `prisma generate` and `npm run build` refresh gitignored outputs (`src/generated/prisma`, `dist`) only.

| Evidence artifact | Contents |
|---|---|
| [`evidence/2026-11-09-t5/validate.log`](evidence/2026-11-09-t5/validate.log) | prisma validate output |
| [`evidence/2026-11-09-t5/generate.log`](evidence/2026-11-09-t5/generate.log) | prisma generate output |
| [`evidence/2026-11-09-t5/lint.log`](evidence/2026-11-09-t5/lint.log) | oxlint output (0 warnings, 33 files) |
| [`evidence/2026-11-09-t5/unit-test.log`](evidence/2026-11-09-t5/unit-test.log) | 11/11 unit tests |
| [`evidence/2026-11-09-t5/build.log`](evidence/2026-11-09-t5/build.log) · [`build-artifact.txt`](evidence/2026-11-09-t5/build-artifact.txt) | build exit, dist entry, ESM output |
| [`evidence/2026-11-09-t5/e2e-test.log`](evidence/2026-11-09-t5/e2e-test.log) | 13/13 e2e (in-memory) |
| [`evidence/2026-11-09-t5/migrate-diff.sql`](evidence/2026-11-09-t5/migrate-diff.sql) · [`migrate-diff.err`](evidence/2026-11-09-t5/migrate-diff.err) | regenerated SQL + warnings |
| [`evidence/2026-11-09-t5/versions.log`](evidence/2026-11-09-t5/versions.log) | node/npm/prisma versions |

Honesty checklist:

- [x] Every command in §1 was actually run in the stated environment; exit codes and key output are recorded.
- [x] No DB-dependent check is reported as passed; all are `DEFERRED (no DB)`.
- [x] E2E is described as in-memory, not database-backed.
- [x] The migration is described as generated and statically verified, not applied.
- [x] No password, JWT, cookie, reset token, or API key appears in this doc or the evidence logs.
- [x] T5 modified no tracked source file; only `docs/qa/evidence/` (QA scope) and gitignored build/generated outputs changed.
