# Architecture and security review — T1 Prisma foundation

| Field | Value |
|---|---|
| Reviewer | `architect` (T4) |
| Reviewed task | T1 — Prisma foundation for US01 schema (`backend-dev`) |
| Date | 9 November 2026 |
| Tree | Uncommitted working tree vs `HEAD` = `a26c73e`; baseline US01 = `1f625b9` |
| Review mode | Read-only on code; checks were run, no source edited, no git writes |
| **Verdict** | **PASS WITH CHANGES** — no blocking findings |

Verdict rationale: the schema, migration SQL, repository ports, `PrismaService` lifecycle and
seed all meet T1 and plan §18/ADR 0002. `lint`, `build`, unit and e2e are green; the committed
migration SQL is byte-identical (ignoring comments/blank lines) to a freshly regenerated
`prisma migrate diff`. Two changes are required before merge (DB-free tests for the new
repositories, generated-client format/coverage boundaries) and one process change is required
(an explicit Phase 2 shim-deletion task). Nothing found weakens auth or exposes secrets.
Database-backed behaviour remains **DEFERRED (no DB)**; no claim of an applied migration is made.

## 1. What was reviewed

| Area | Artifacts |
|---|---|
| Schema | `backend/app/prisma/schema.prisma` |
| Migration | `prisma/migrations/20261109041339_init_auth_schema/migration.sql`, `migration_lock.toml` |
| Prisma wiring | `src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`, `src/app.module.ts` |
| Repositories | `src/users/prisma-users.repository.ts`, `src/sessions/prisma-sessions.repository.ts`, unchanged interfaces in `src/users/*.repository.ts` / `src/sessions/*.repository.ts` |
| Seed | `prisma/seed.ts` |
| Config/scope | `package.json`, `package-lock.json`, `tsconfig.build.json`, `.gitignore`, `.env.example`, deleted `src/database/{migrate,migrations,seed}.ts`, transitional shims |

Scope check: `git status --short` shows only T1 paths under `backend/app/` changed/added/deleted
(the untracked `docs/qa/evidence/` belongs to QA, not T1). No cookie, CSRF, email, reset-endpoint
or frontend work is present. `src/generated/` and `.env` are correctly gitignored.

## 2. Findings

### F1 — Medium — `src/users/prisma-users.repository.ts:32-48`, `src/sessions/prisma-sessions.repository.ts:38-59`, `test/auth.e2e-spec.ts:69-72`
**Issue.** No automated test exercises the new Prisma repositories or `prisma/seed.ts`. The 24
green tests use `InMemoryUsersRepository`/`InMemorySessionsRepository` overrides, and
`test/app.e2e-spec.ts` boots `AppModule` without ever querying. The collaboration quality bar
requires "new behavior has a test" (`COLLABORATION.md` §6), and T1's most failure-prone claims
(null-hash → `null`, revoke/expiry semantics, email normalisation) are unverified locally.
**Suggested fix.** Add DB-free unit specs with a mocked `PrismaService` (no Postgres needed),
covering at least: `findByEmail` → `null` for missing credential and for `passwordHash: null`;
lowercase/trim lookup; `findById` mapping; `revoke` returns `false` when already revoked, `true`
when a row was updated; `findActiveById` filters revoked/expired. Keep real-DB e2e deferred to
CI Day 6. If the Lead instead accepts deferral, record it explicitly in T5 as
`DEFERRED (no DB)` with the CI ticket — do not leave the gap implicit.

### F2 — Low — `package.json:11`, `vitest.config.ts:8-12` (no `.prettierignore`)
**Issue.** Plan §18.3 / ADR 0002 require the generated client excluded from lint, **Prettier and
coverage**. Lint is excluded (`package.json:16`), but the format script still globs
`src/**/*.ts` (would rewrite `src/generated/**`) and no coverage exclusion exists. Today
`prettier --check src/generated/prisma/client.ts` happens to pass, so this is a boundary gap, not
a live failure.
**Suggested fix.** Add `.prettierignore` containing `src/generated/` and add
`coverage.exclude: ['src/generated/**', ...]` to `vitest.config.ts` (and e2e config if coverage is
ever collected there).

### F3 — Low (process) — `src/database/database.module.ts:1-8`, `src/users/postgres-users.repository.ts:1-9`, `src/sessions/postgres-sessions.repository.ts:1-9`, `src/auth/auth.module.ts:4,8,10,21,45-46`
**Issue.** The three transitional re-export shims are acceptable for Phase 1 (see Q1), but
nothing in the tree records that they are temporary; Phase 2 could leave misleading
`postgres-*` filenames in place indefinitely.
**Suggested fix.** Create an explicit Phase 2 task (owner `backend-dev`) that deletes all three
shims and points `AuthModule` directly at `PrismaUsersRepository`/`PrismaSessionsRepository`,
before US01 cookie work begins. Add a TODO comment pointing at that task id (optional, since the
decision lives on the board).

### F4 — Low — `prisma/seed.ts:85-118` (hash inside transaction at `:102-103`)
**Issue.** Five argon2id hashes (19 MiB, t=2) are computed sequentially **inside** one interactive
`$transaction`. Prisma's default interactive-transaction timeout is 5 s; on a slow CI runner or
loaded machine this can time out, and it holds a transaction open during CPU work for no benefit.
**Suggested fix.** Hash all passwords before opening the transaction (or hash per user outside
`$transaction` while keeping each upsert atomic), then run the DB writes in a single short
transaction.

### F5 — Low — `prisma/schema.prisma:34`, `.../migration.sql:19` (`updated_at`), `:28` (`password_updated_at`)
**Issue.** The old baseline migration had `updated_at timestamptz NOT NULL DEFAULT now()` and
`password_updated_at ... DEFAULT now()`; the new migration has no DB default for `updated_at`
(and `password_updated_at` is nullable by D4). Prisma's `@updatedAt` supplies the value on every
Prisma write, so current code paths are correct, but raw SQL inserts/backfills would now fail on
`updated_at`. UUID PKs likewise have no DB default (Prisma `uuid()` generates client-side) — same
category, no current writer bypasses Prisma.
**Suggested fix.** Accept as-is for Phase 1 (matches plan §18.1 exactly; Prisma is the only
writer). If hardening is wanted, add `@default(now())` to `updatedAt` **before** the baseline
migration is committed and regenerate it; otherwise document "Prisma is the only schema writer"
in the runbook.

### F6 — Low — `src/users/user.types.ts:24-30`, `src/users/prisma-users.repository.ts:55-72`, `prisma/seed.ts:113-116`
**Issue.** `CreateUserInput.passwordHash` is required, so `PrismaUsersRepository.create()` cannot
create the D4 "account exists before a password" user. The schema and login path support it
(`Credential?`, nullable hash, seed bypasses the repository with `deleteMany`). This is not a T1
defect — interfaces were intentionally preserved and `AuthService` untouched — but US02 will hit
it.
**Suggested fix.** Record as a US02/Phase 2 prerequisite: make `passwordHash` optional (creating
`credential` only when present) or add a dedicated invited-user method, so US02 never bypasses
the repository.

### F7 — Info / question — `prisma/schema.prisma:28`, `migration.sql:58`, `src/users/prisma-users.repository.ts:23-26`
**Issue.** Case-insensitive email uniqueness is now enforced by application normalisation plus a
plain `UNIQUE(email)`, replacing the old `lower(email)` functional index (accepted in plan §18.2).
Any writer that bypasses the repository/seed can insert a mixed-case row that login will not
find, because lookups lowercase the input.
**Suggested fix.** Accept for Sprint 1, or add an additive `CHECK (email = lower(email))` in a
later migration. Needs a recorded choice, not silent divergence.

### F8 — Info — root `README.md:7-8,18,34` (not T1 scope)
**Issue.** Repo README still says "four demo accounts", "schema in `src/database`" and describes
the Bearer US01 status. Plan §22.1 owns the root README update on Day 10; flagging so it is not
lost when T1 makes it more stale.
**Suggested fix.** Leave for the Day 8–10 documentation pass; update account count to six and
schema location to `prisma/`.

### F9 — Info — `.env.example:16`, plan §15.5 vs §18.4
**Issue.** The example `SEED_PASSWORD=RafConsult!2026` is 14 characters; the plan's env matrix
(§15.5) says "16+ chars" while §18.4 only requires ≥12, and the seed enforces ≥12 (D11). Demo-only,
no security impact, but the plan is internally inconsistent.
**Suggested fix.** Align the plan/env matrix and the example in the documentation pass (keep the
12-character D11 floor as the enforced rule).

## 3. Answers to the Lead's three transitional questions

| Question | Judgement |
|---|---|
| **1. One-line re-export shims for `DatabaseModule` / `Postgres*Repository`** | **Acceptable for Phase 1**, conditional on an explicit Phase 2 deletion task (F3). They contain no `pg` code, the alias re-exports the same class object so Nest resolves a single `PrismaModule`/`PrismaService`, and the e2e run proves `AppModule` boots with `AuthModule` importing the shims. Risk is only naming/staleness. |
| **2. `declaration: false` in `tsconfig.build.json`** | **Justified; not hiding a build problem.** Reproduced with `tsc -p tsconfig.build.json --declaration --emitDeclarationOnly`: `TS4094` at `src/generated/prisma/internal/prismaNamespace.ts:122,128,134` (and the browser namespace). The app is deployed as JavaScript, not consumed as a library; base `tsconfig.json` keeps `declaration: true` for the IDE; `npm run build` passes and emits `dist/`. Keep it. Nit: the comment could name the actual generated file/TS4094 for future readers. |
| **3. Prisma pinned `6.19.3`; `package.json#prisma` deprecated; v7 needs a driver adapter** | **Accept as Phase 1 scope; not blocking.** `prisma` and `@prisma/client` are both exactly `6.19.3`; `prisma validate`/`generate` work; the only cost is the deprecation warning on every Prisma command (`package.json#prisma` removed in Prisma 7). Do not upgrade mid-sprint: v7 requires a driver adapter (e.g. `@prisma/adapter-pg`), config-file migration and a re-review of engine/packaging. Record "migrate to `prisma.config.ts` + evaluate Prisma 7 driver adapter" as a Sprint 2 task; add the rationale to ADR 0002's consequences when convenient. |

## 4. Verified good (evidence)

- **Schema invariants** (`schema.prisma:14-79`): `UserRole`/`ResetTokenPurpose` enums; nullable
  `Credential.passwordHash`/`passwordUpdatedAt` (D4); `tokenVersion` default 0; `isActive`;
  `Session.revokedAt`/`expiresAt` indexes; `PasswordResetToken.tokenHash` unique + `purpose`;
  cascade FKs; UUID PKs; `timestamptz(6)`; `@@map` snake_case; email unique; `@@index([role])`.
- **Migration vs schema**: regenerated `npx prisma migrate diff --from-empty --to-schema-datamodel
  prisma/schema.prisma --script` is identical to the committed file ignoring comments/blank lines.
  No `DROP`/`TRUNCATE`/destructive statements; timestamped folder
  `20261109041339_init_auth_schema` (04:13:39 UTC) and `migration_lock.toml` (postgresql) present.
- **Repository fidelity**: interfaces and `AuthService` unchanged (`git diff` shows only the
  implementation re-exports); `findByEmail` returns `null` for missing credential **or** null hash
  (`prisma-users.repository.ts:42-45`), preserving generic-401 behaviour; `create` uses a nested
  credential write (single atomic Prisma operation) with the same input contract; session
  `revoke`/`findActiveById` semantics match the old SQL (`revoked_at IS NULL`, `expires_at > now`).
- **Prisma ESM**: `prisma-client` generator, `moduleFormat = "esm"`, output
  `../src/generated/prisma`; generated client is gitignored, lint-excluded, inside `tsconfig`, and
  compiles (`dist/generated/prisma/client.js` emitted). `PrismaService` is global, constructs from
  validated `DATABASE_URL`, connects lazily, `$disconnect`s on `OnModuleDestroy`; `main.ts` enables
  shutdown hooks. `AppModule` skips Observe instrumentation only for `PrismaService` (documented
  reason) and e2e boots with no database running.
- **Seed**: six accounts exactly as plan §18.4 (admin, pm, worker, viewer, inactive, invited);
  emails/roles/states correct; idempotent `upsert` by email plus `credential.deleteMany` for the
  invited account; reuses `PasswordHasher`/`HASH_OPTIONS` (no duplicated argon2 parameters);
  production guard requires `ALLOW_DEMO_SEED=true`; refuses `SEED_PASSWORD` shorter than 12; logs
  no password/token.
- **Security**: no secret in the diff; `.env` gitignored (`git check-ignore` confirms); `.env.example`
  contains placeholders only; no new credential/token logging; auth behaviour untouched (Bearer
  transport is Phase 2 by design). `pg` and `@types/pg` fully removed (`npm ls pg` → empty; lock
  diff removes only the pg dependency tree).

## 5. Deferred checks (not run, not claimed)

| Check | Status | Why |
|---|---|---|
| Migration applied against PostgreSQL | **DEFERRED (no DB)** | No Docker daemon / local Postgres (`COLLABORATION.md` §8). SQL reviewed statically; CI/staging runs `prisma migrate deploy` |
| Repository/seed behaviour against a real DB | **DEFERRED (no DB)** | T5/CI Day 6; F1 closes the DB-free gap in the meantime |
| `prisma db seed` end-to-end | **DEFERRED (no DB)** | Static review of idempotency/guards only; H1 guard verified by reading |
| Staging `/health` and Prisma runtime connection | **DEFERRED** | Phase 5; not part of T1 |

## 6. Questions for the Lead

1. **F1** — fix now with DB-free mocked repository specs, or explicitly defer to CI Day 6 in T5?
   Recommendation: add the mocked specs now; they take little time and need no database.
2. **F3** — create the Phase 2 shim-deletion task now (owner `backend-dev`) so it cannot be
   forgotten when `AuthModule` is rewritten?
3. **F5/F7** — accept `updated_at` without a DB default and app-level email normalisation as-is for
   Phase 1, or schedule hardening (`@default(now())` before commit / additive `CHECK` later)?
4. **F3 question 3** — confirm the Prisma 7 + `prisma.config.ts` work is recorded for Sprint 2,
   not attempted in this sprint.
5. Root README staleness (F8) — confirm it stays in the Day 10 documentation pass.

## 7. Evidence appendix

Run from `scaffold/backend/app` on Node 26.13.0, 9 Nov 2026:

| Command | Result |
|---|---|
| `npm run lint` | `Found 0 warnings and 0 errors.` — 33 files, generated client excluded |
| `npm run build` | exit 0; `dist/generated/prisma/client.js` emitted |
| `npm test` | 4 files, **11/11 passed** (632 ms) |
| `npm run test:e2e` | 2 files, **13/13 passed** (775 ms); `AppModule` boots without a DB |
| `npx prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` (warning: `package.json#prisma` deprecated) |
| `npx prisma -v` | CLI 6.19.3, client 6.19.3, engine `debian-openssl-3.0.x`, TS 6.0.3 |
| `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` → diff vs committed SQL | identical ignoring comments/blank lines |
| `npx tsc -p tsconfig.build.json --declaration --emitDeclarationOnly` | fails TS4094 in generated `prismaNamespace.ts` → justifies `declaration:false` |
| `npm ls pg` | `(empty)`; lock diff removes only the pg tree |
| `git status --short` | files under `backend/app/` only (plus QA's `docs/qa/evidence/`); `src/generated/` and `.env` ignored |

Sign-off: **PASS WITH CHANGES** — merge after F1/F2 are addressed (or F1 is explicitly deferred by
the Lead) and the Phase 2 shim-deletion task (F3) exists. No code was edited during this review.
