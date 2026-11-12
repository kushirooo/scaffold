# Architecture and security review — US01 cookie reconciliation (T8)

| Field | Value |
|---|---|
| Reviewer | `architect` (T12) |
| Reviewed task | T8 — Phase 2: US01 cookies, `tokenVersion`, CSRF, CORS + shim removal (`backend-dev`) |
| Date | 9 November 2026 |
| Tree | Uncommitted worktree vs `HEAD` `40540e9` |
| Review mode | Read-only on code; checks and live HTTP probes run; no source edited, no git writes |
| **Verdict** | **PASS WITH CHANGES** — **no blocking findings** |

The transport swap is correct and the green suite is not status-code theatre: I re-ran
lint/build and all three suites (40 unit / 22 live e2e / 22 DB) and booted the built API three
times (dev, production-like, DB-down) to verify the things a mock or a `200` cannot prove —
cookie attributes on set **and** clear, CSRF-before-auth ordering, `Authorization` being
ignored, credentialed CORS, and `/health` returning 503 when the DB is unreachable. All
behaved as specified. The required changes are test hardening for edge cases absent from the suite
(tampered/expired JWT, role-change, clear/prod cookie attributes) and the CI seed/DB wiring
needed once e2e runs against a real database; the rest are small contract drifts. Nothing
weakens authentication, logs a secret, or leaves a Bearer path intact.

## 1. Scope reviewed

Uncommitted T8 diff: `src/auth/**` (controller, service, types, cookies, DTO, guards),
`src/config/env.validation.ts` + spec, `src/app.module.ts`, `src/app.setup.ts`,
`src/users/**`, `src/sessions/**`, deleted `src/database/database.module.ts` and the two
`postgres-*` shims, new `src/health/**`, `test/**`, `package.json`/lock,
`.env.example`, `docs/api-contract-us01.md`. The T8 diff touches only its declared write
scope; `docs/qa/**` changes in the tree belong to QA, not T8.

## 2. Findings

### F1 — Medium — `test/auth.e2e-spec.ts` (whole file; gap relative to plan §16.3)
**Issue.** Three security paths the plan/test matrix names are not exercised at all: a
**tampered JWT cookie**, an **expired JWT**, and **role-change invalidation** (listed in the
contract's invalidation matrix, `docs/api-contract-us01.md:184`). The code handles them
(`jwt-auth.guard.ts:61-66`, `auth.service.ts:128-136`), but a regression in JWT verification
or the role comparison would keep the suite green.
**Suggested fix.** Add e2e cases without touching product code: set a cookie whose signature
is flipped → `401 Invalid or expired access token`; sign a payload with
`JwtService.sign(..., { expiresIn: -10 })` → `401`; update a user's role in the DB, call
`/auth/me`, expect `401 Session is no longer valid`, then restore in `finally` (same pattern
as the existing `tv` test at `test/auth.e2e-spec.ts:251-278`).

### F2 — Low — `test/auth.e2e-spec.ts:116-122,234-236`; no `src/auth/auth.cookies.spec.ts`
**Issue.** Cookie assertions cover the **dev set** case only (`HttpOnly`, `Path=/`,
`Max-Age`, `SameSite=Lax`, no `Secure`). The **clear** path asserts only the empty value and
the 1970 expiry — not that `HttpOnly`/`Path`/`SameSite` (and `Secure` in production) are
preserved on the clearing `Set-Cookie`. The staging/production attribute combination is only
covered indirectly through env-validation unit tests. I verified the behaviour live (see
§6), so this is a test-boundary gap, not a defect.
**Suggested fix.** Add a small `AuthCookies` unit spec with a mocked `Response`: dev config →
`cookie('mars_at', token, { httpOnly: true, secure: false, sameSite: 'lax', path: '/',
maxAge: 3600000 })`; production config → `secure: true, sameSite: 'none'`; `clearCookie`
receives `httpOnly`/`secure`/`sameSite`/`path`; then extend the e2e clear assertion to check
`HttpOnly`, `Path=/` and `SameSite`.

### F3 — Medium (forward-looking) — `test/auth.e2e-spec.ts:20-26,55-69`; `SPRINT1_PLAN.md` §14.2
**Issue.** The e2e suite now boots the real `AppModule` and logs in with the **seeded demo
accounts** from the **development** database (`.env` `DATABASE_URL` → `raf_pms`). It also
creates/revokes sessions and briefly mutates `viewer.tokenVersion`. Consequences: (a) a clean
or empty database makes `npm run test:e2e` fail on the first login; (b) the plan's CI job
(§14.2) runs `prisma migrate deploy` then `npm run test:e2e` with **no seed step** and no
disposable DB, so CI would be red when it is added on Day 6; (c) running e2e against a
staging/demo URL would write to that data. `test:db` is guarded (`test/db/support/test-database.ts:36-55`)
but e2e is not.
**Suggested fix.** Before the CI gate: seed the API job's DB (`SEED_PASSWORD=… npm run db:seed`)
or self-seed the suite, point e2e at a disposable DB (reuse `resolveTestDatabaseUrl`/guarded
`DATABASE_URL`), and document the prerequisite in the contract/runbook. Not a T8 code defect,
but it is a direct consequence of the new DB-backed e2e.

### F4 — Low — `docs/api-contract-us01.md:44-48,131`
**Issue.** The documented `Set-Cookie` example omits `Expires`, but the live response sets
both `Max-Age=3600` and `Expires=<date>` (Express derives `Expires` from `maxAge`,
`src/auth/auth.cookies.ts:20-26`). QA/frontend reading the contract may treat the extra
attribute as drift.
**Suggested fix.** Mark the sample as illustrative or include `Expires`;
state that `HttpOnly`, `Path=/`, `SameSite`, `Secure` are the contract, `Expires` is derived.

### F5 — Low — `docs/api-contract-us01.md:171` vs `src/sessions/prisma-sessions.repository.ts:41-47`
**Issue.** The contract says the session check uses `expires_at > now()` (database clock);
the Prisma repository filters `expiresAt: { gt: new Date() }` (application clock). Behaviour is
consistent because both `expires_at` and the JWT `exp` are computed from the same application
clock, but the contract wording is not literally what executes.
**Suggested fix.** Change the contract to "`expires_at` in the future" (or document the
application-clock comparison). No code change recommended.

### F6 — Low — `docs/api-contract-us01.md:318` vs `src/users/user.types.ts:26-32`, `src/users/prisma-users.repository.ts:52-69`
**Issue.** §12 tells US02 to create users through `UsersRepository.create()`, but
`CreateUserInput.passwordHash` is required and `create()` always writes a credential, whereas
§8 (D4) says US02 creates the account **before** a password exists. The invited account can
only be produced by bypassing the repository (as the seed does with `deleteMany`). This will
surface as a cross-team blocker in Phase 3.
**Suggested fix.** Extend the repo contract (`passwordHash?` or a dedicated `createInvited`
method) before US02 uses it, and update §12. Not a T8 defect; flag for the Lead/US02 handoff.

### F7 — Info — `docs/api-contract-us01.md:274-286`
**Issue.** The environment table omits `ALLOW_DEMO_SEED`, which §9 references and
`.env.example` documents; `OBSERVE_*` is also absent (pre-existing). Minor doc gap.
**Suggested fix.** Add the row in the documentation pass.

### F8 — Info (advisory) — `src/app.setup.ts:28-36`; `src/health/health.controller.ts:22-33`
**Issue.** Auth responses carry no `Cache-Control: no-store`/`private` and `/health` exposes
`db: up|down` anonymously. No shared cache exists in the current Vercel→Railway topology and
the plan requires a public health route, so neither is a defect; both are cheap hardening.
**Suggested fix.** Consider `Cache-Control: no-store` on `/auth/*` and, optionally, an
internal-token or IP-restricted health check in Sprint 2. Record, do not block.

### F9 — Info — `src/config/env.validation.ts:7,24-26`
**Issue.** `::1` is allowlisted but `new URL('http://[::1]:3000').hostname` returns
`'[::1]'` (brackets), so the IPv6 loopback literal is rejected as non-local. `localhost` and
`127.0.0.1` work; no sprint impact.
**Suggested fix.** Strip brackets when comparing hostnames (or add `'[::1]'`). One-line test.

### F10 — Info — `src/config/env.validation.ts:176-190`
**Issue.** Production boot requires `COOKIE_SECURE=true` but does **not** require
`COOKIE_SAMESITE=none`; a staging deploy that forgets it boots with `lax` and cross-site login
silently fails. This matches the plan (only `none ⇒ secure` is enforced) and the env matrix
documents `none` for staging, so it is an operational trap rather than a deviation.
**Suggested fix.** None required for T8; the runbook/checklist should assert staging env
values (already in plan §15.5). Optional: warn at boot when `NODE_ENV=production` and
`COOKIE_SAMESITE=lax`.

## 3. Answers to the requested review checks

| Check | Result |
|---|---|
| **Cookie flags on set** | **PASS.** Live dev: `HttpOnly; SameSite=Lax; Path=/; Max-Age=3600` (+ derived `Expires`), no `Secure`. Live production-like env: same with `Secure; SameSite=None`. No other auth cookie is set |
| **Cookie flags on clear** | **PASS.** Live logout: `mars_at=; Path=/; Expires=Thu, 01 Jan 1970 …; HttpOnly; SameSite=Lax` (Secure in production) — flags preserved via `auth.cookies.ts:33-41`. Test assertion gap → F2 |
| **CSRF guard ordering / exemptions** | **PASS.** Global `APP_GUARD` (`app.module.ts:42-47`) runs before controller `JwtAuthGuard`; no exemptions, no Reflector/skip metadata. Live: `POST /auth/logout` with a valid cookie but no header returns **403** (not 401), proving order |
| **Login CSRF-protected** | **PASS.** e2e missing/wrong header → 403 (`test/auth.e2e-spec.ts:169-184`); no exemption path exists |
| **`/auth/me` ignores `Authorization`** | **PASS.** Token extracted only from `request.cookies` (`jwt-auth.guard.ts:22-27`); e2e + live `Authorization: Bearer <valid JWT>` without cookie → **401 Authentication required** |
| **`tokenVersion` comparison location** | **PASS.** `tv` signed at `auth.service.ts:86-96`, compared in `AuthService.resolveSession` (`:121-142`) called by the guard, after the session check. e2e bumps DB `token_version` → 401, restores → cookie works again; unit test covers it |
| **CORS preflight for `X-MARS-CSRF`** | **PASS.** e2e asserts ACAO/credentials and both allowed headers (`:297-312`); live preflight for a disallowed origin returns **no** ACAO; live allowed-origin login returns ACAO + `Allow-Credentials: true`; wildcard boot rejection verified live |
| **Health DB failure path** | **PASS.** `$queryRaw SELECT 1`, catch → 503 `{status:'error',db:'down'}`, no error detail leaked. Live with an unreachable DB URL: **503** in 17 ms; unit test covers both branches; e2e covers the up path |
| **Shim leftovers / `pg`** | **PASS.** All three shims and `src/database/` are gone; no imports of `pg`, `DATABASE_POOL`, `DatabaseModule` or `postgres-*` remain; `AuthModule` injects `PrismaModule` + Prisma repositories directly; `npm ls pg` empty |
| **Contract vs implementation** | **PASS with minor drift** — no Bearer/header-auth text remains; endpoints, bodies, error messages, cookie flags, CSRF, CORS, D1 `/dashboard` and `/health` match. Drift limited to F4–F7 |
| **Secret/token leakage** | **PASS.** No token/password keys in any response body (e2e asserts exact body); no `console`/`Logger` in `src/`; server log probe for `mars_at`/`accessToken`/`passwordHash` → 0 hits; no secrets in the diff; `.env` ignored |

## 4. Verified good (positive evidence)

- **Transport:** login body is exactly `{user, redirectTo, expiresIn}` (`auth.controller.ts:31-38`,
  `auth.types.ts:25-36`); the JWT exists only in the `mars_at` cookie; `cookie-parser` installed
  before guards (`app.setup.ts:18`); no `Authorization` fallback; no refresh token.
- **Session model:** per-device revocation via `sessions.revoked_at` and global invalidation via
  `users.token_version` are both enforced on every protected request (`jwt-auth.guard.ts:72-74`,
  `auth.service.ts:121-142`); JWT algorithm/issuer/audience fixed in `AuthModule` (`:21-37`);
  payload shape validated (`jwt-auth.guard.ts:29-44`), including integer `tv` and known role.
- **CSRF:** static non-secret header is the agreed design (D5); safe methods pass; strict
  equality; no exemptions; 403 body matches the contract.
- **CORS/boot:** `credentials: true`, exact origin list, `Content-Type`/`X-MARS-CSRF`,
  `maxAge: 600`, no wildcard/response reflection; boot rejects `*`, non-HTTPS non-localhost
  origins, origin-with-path, `COOKIE_SAMESITE=none` without `COOKIE_SECURE`, and production
  insecure cookies (12 unit tests).
- **D1:** `dashboardPathForRole` returns `/dashboard` for all roles (`role-dashboard.ts`),
  role still returned in `user.role`; unit + e2e cover all four roles.
- **Health:** new module wired into `AppModule`, public GET, 200 `{status:'ok',db:'up'}` /
  503 `{status:'error',db:'down'}`; no secret detail in the failure body.
- **Tests are substantive, not theatre:** exact-body `toEqual` on login; cookie-header parsing
  and attribute checks; CORS response headers; DB `tokenVersion` mutation with restore; unit
  tests for `resolveSession` (logout, deactivation, `tv`), env validation, repositories, health
  and seed. No `it.skip`/`.only`/`@ts-ignore`/lint suppressions in `src` or `test`.
- **Scope:** only T8's declared paths changed; `src/auth` has no Phase 3/4 email/reset code;
  the contract contains no Bearer-era text.

## 5. Deferred / not verified here

| Item | Status |
|---|---|
| Real staging cross-site cookie behaviour (Vercel→Railway, Safari/ITP) | **DEFERRED to staging** (plan R4/G5); local dev and a production-like env were verified, not real registrable-domain traffic |
| Staging `prisma migrate deploy` / Railway run | **DEFERRED**; migration is applied to local dev/test DB (`npm run test:db` global setup, `raf_pms_test`) |
| CI (GitHub Actions) execution | **Not present yet** (Day 6); F3 records the seed/DB requirement before it lands |
| US19 password-change/reset invalidation (`token_version += 1`, revoke-all) | **Out of scope** (Phase 4); guard-side comparison is ready and tested |
| Login rate limiting | Known gap, stated in contract §7 (D9) |
| `SameSite=None` actual browser send/receive across sites | Deferred; flags verified on the wire, browser policy must be tested on staging |

## 6. Questions for the Lead

1. **F1/F2** — schedule the test additions before the T8 merge (cheap, no-DB/DB e2e), or as a
   QA follow-up before the Day 9 freeze? Recommendation: do F2 (unit) now; F1 e2e cases with
   the same suite.
2. **F3** — confirm the Day 6 CI job will seed the DB and use a disposable database for e2e;
   should this be a T8 follow-up task or folded into the CI task?
3. **F4–F6** — contract patches: assign to `backend-dev` (contract owner) as a docs-only
   follow-up, or have the Lead commit them with T8? They do not block the code.
4. Confirm `npm run test:e2e` intentionally targets the development DB for local runs
   (contract line 309 says "live database"); if so, add the "seed required" note.

## 7. Evidence appendix

Run from `scaffold/backend/app` on Node 26.13.0, 9 Nov 2026.

| Command / probe | Result |
|---|---|
| `npm run lint` | `Found 0 warnings and 0 errors.` — 46 files, generated client excluded |
| `npm run build` | exit 0 |
| `npm test` | 8 files, **40/40 passed** |
| `npm run test:e2e` | 3 files, **22/22 passed** |
| `npm run test:db` | 4 files, **22/22 passed**; migrations already applied to `raf_pms_test` |
| Live dev boot (`node dist/main.js`, `.env`) | login 200, body exactly 3 keys, `Set-Cookie: mars_at=…; Max-Age=3600; Path=/; Expires=<derived>; HttpOnly; SameSite=Lax`; `/auth/me` cookie 200; Authorization-only 401; logout no-CSRF 403; logout with CSRF 204 + clearing cookie with `Path=/`, `Expires=1970`, `HttpOnly`, `SameSite=Lax`; `/health` 200 `{ok,up}` |
| Live production-like boot (`NODE_ENV=production COOKIE_SECURE=true COOKIE_SAMESITE=none`) | login `Set-Cookie` adds `Secure; SameSite=None`; CORS `Access-Control-Allow-Origin: https://portal.example` + `Allow-Credentials: true` |
| Live DB-down boot (`DATABASE_URL` → closed port) | `/health` **503** `{status:'error',db:'down'}` |
| Live boot validation | wildcard CORS → `CORS_ORIGIN must not contain a wildcard "*"`; `SameSite=None` + insecure cookie → `COOKIE_SAMESITE=none requires COOKIE_SECURE=true` |
| Static greps | no `Bearer`/header-auth in contract; no `pg`/`DATABASE_POOL`/`DatabaseModule`/`postgres-*` refs; no `console.`/`Logger` in `src`; no skipped/only tests; no token strings in server log probe |

Sign-off: **PASS WITH CHANGES** — no blocking findings; merge after F1/F2 test hardening (or a
recorded deferral) and with F3 handled at the CI gate. No code was edited during this review.
