# Independent Verification — US01 Cookie Contract (T8 reconciliation)

| Field | Value |
|---|---|
| Task | `task-13` — independent QA verification of US01 cookies / CSRF / `tokenVersion` / CORS |
| Implemented by | `backend-dev` (T8) |
| Verified by | `qa-engineer` (independent reproduction; not from the implementation report) |
| Date / time | 2026-11-09 13:24–13:34 +08 (Asia/Kuala_Lumpur) |
| Repository | `scaffold` — branch `feat/prisma-foundation`, HEAD `40540e9`; T8 changes are **uncommitted in the working tree** (Lead owns the commit) |
| Environment | Agent sandbox — local PostgreSQL 18.6 at `127.0.0.1:5432`; Node v26.13.0, npm 12.2.2, Prisma 6.19.3 |
| Databases | `raf_pms` (live development DB, seeded with 6 accounts — used by the local e2e suite and the smoke) and `raf_pms_test` (dedicated DB suite) |
| Verdict | **PASS (API)** — the US01 API contract (cookie transport, CSRF, CORS, `tokenVersion`, logout revocation, D1 redirect, `/health`) is independently verified; the frontend redirect portions of AC1/AC3/AC4 and staging cookie flags remain **pending** |

**Post-review closure (T15, 9 Nov 2026):** T14 closed the review findings and this document's OBS-1/OBS-2/OBS-3. `npm run test:e2e` now targets the dedicated `raf_pms_e2e` database (guard refuses `raf_pms`; `raf_pms` counts verified unchanged 6/53/5), tampered/expired/role-change e2e cases and an `AuthCookies` dev/prod set/clear spec were added (5/5 mutations caught), and `SEED_PASSWORD` is required with no demo-password fallback. Re-verification: [`verification-us01-review-fixes.md`](verification-us01-review-fixes.md). The T13 live results remain valid for the shipped behaviour; the T15 smoke re-confirmed cookie/CSRF/CORS/`tv` unchanged (18/18).

**What this PASS means:** the reconciled API contract works end-to-end against the real database and a real HTTP server: login sets the `mars_at` httpOnly cookie with the expected flags and returns no token; `/auth/me` works only from the cookie; logout clears the cookie and revokes the session; CSRF is enforced on every non-GET; CORS is exact-origin with credentials; a `token_version` mismatch invalidates a live cookie; all roles are redirected to `/dashboard`.
**What it does not mean:** the login page, route guard and logout UI are Member 3's and are **not** implemented, so US01 AC1/AC3/AC4 are not complete end-to-end; staging cookie flags (`Secure`, `SameSite=None`) are unverified until staging exists. No AC row is claimed as a full PASS.

No source was edited, no schema changed, no Git writes were made. No seed password, JWT or cookie value was printed; the smoke parses flags/statuses only and the evidence logs were scanned for credential strings.

---

## 1. Commands and results

Run from `/home/anoshizuku/Projects/scaffold/backend/app` unless stated.

| # | Command | Exit | Result | Evidence |
|---|---|---|---|---|
| 1 | `npm run lint` | 0 | `Found 0 warnings and 0 errors.` · **46 files** | [`lint.log`](evidence/2026-11-09-t13/lint.log) |
| 2 | `npm test` | 0 | `Test Files 8 passed (8)` · **40/40** (env validation 12, users repo 9, sessions repo 5, role map 2, health 2, hasher 3, app 1, auth service 6) | [`unit-test.log`](evidence/2026-11-09-t13/unit-test.log) |
| 3 | `npm run test:e2e` | 0 | `Test Files 3 passed (3)` · **22/22** (app 1, health 1, auth 20) — target cookie contract against the **live `raf_pms`** development DB | [`e2e-test.log`](evidence/2026-11-09-t13/e2e-test.log) |
| 4 | `npm run test:db` | 0 | `Test Files 4 passed (4)` · **22/22** against `raf_pms_test` (unchanged real-DB suite) | [`test-db.log`](evidence/2026-11-09-t13/test-db.log) |
| 5 | `npm run build` | 0 | `nest build` exit 0; ESM `dist/main.js` | [`build.log`](evidence/2026-11-09-t13/build.log), [`build-artifact.txt`](evidence/2026-11-09-t13/build-artifact.txt) |
| 6 | Boot rejection: `CORS_ORIGIN='*' PORT=4020 node dist/main.js` | **1** | `Error: CORS_ORIGIN must not contain a wildcard "*"` — process exits before listening | [`boot-validation.log`](evidence/2026-11-09-t13/boot-validation.log) |
| 7 | Boot rejection: `COOKIE_SAMESITE=none COOKIE_SECURE=false PORT=4020 node dist/main.js` | **1** | `Error: COOKIE_SAMESITE=none requires COOKIE_SECURE=true` — process exits before listening | [`boot-validation.log`](evidence/2026-11-09-t13/boot-validation.log) |
| 8 | Live curl smoke on `127.0.0.1:4000` (real `raf_pms`, Phase-2 contract) | 0 | `RESULT: PASS (25/25 checks)` — details in §2 | [`api-cookie-smoke.log`](evidence/2026-11-09-t13/api-cookie-smoke.log) |
| 9 | `raf_pms` after e2e + smoke | 0 | still **6 users / 5 credentials**, every `token_version = 0`, **0** non-demo/fixture users | [`raf_pms-baseline.log`](evidence/2026-11-09-t13/raf_pms-baseline.log), [`raf_pms-after-e2e.log`](evidence/2026-11-09-t13/raf_pms-after-e2e.log), [`raf_pms-final-state.log`](evidence/2026-11-09-t13/raf_pms-final-state.log) |
| 10 | Static checks (§4) | 0 | no `Bearer`, no header-auth fallback, three shims gone, no `pg`, no token fields in bodies | [`static-checks.log`](evidence/2026-11-09-t13/static-checks.log) |

The smoke was a purpose-built curl harness for this task (cookie jar + header capture). `scripts/smoke-staging.sh` was **not** run: it targets staging, which does not exist.

---

## 2. Live HTTP smoke — 25/25 checks

Server: built `node dist/main.js` on port 4000 against `raf_pms`; allowed origin from `.env` `CORS_ORIGIN` (`http://localhost:3000`); disallowed origin `http://evil.example`. Each request/response is logged by status/flag only — cookie values were never printed.

| Area | Check | Result |
|---|---|---|
| Health | `GET /health` → `200` `{status:ok, db:up}` (real DB `SELECT 1`) | PASS |
| Login | `POST /auth/login` with `X-MARS-CSRF: 1` → `200` | PASS |
| Cookie flags | `mars_at` → `HttpOnly=yes`, `Path=/`, `Max-Age` present, `SameSite` present (`Lax`), `Secure` absent (dev) | PASS |
| Cookie storage | Cookie jar marks `mars_at` httpOnly (`#HttpOnly_` entry) | PASS |
| Login body | `user=pm@rafconsult.test`, `role=PROJECT_MANAGER`, `redirectTo=/dashboard`, `expiresIn=3600`, **no `accessToken`, no `tokenType`, no `passwordHash`** | PASS |
| Login CORS | allowed origin → exact `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true` | PASS |
| Me | `GET /auth/me` with cookie → `200` user payload, no token/hash | PASS |
| Me | `GET /auth/me` without cookie → `401` `Authentication required` | PASS |
| CSRF | login without `X-MARS-CSRF` → `403` `Missing or invalid CSRF header` | PASS |
| CSRF | login with wrong value (`X-MARS-CSRF: true`) → `403` | PASS |
| CSRF | logout without `X-MARS-CSRF` → `403`; the rejected request did **not** revoke the session | PASS |
| Auth fallback | `Authorization: Bearer <cookie JWT>` with no cookie → `401` `Authentication required` (no header fallback) | PASS |
| CORS | disallowed origin → **no** `Access-Control-Allow-Origin` | PASS |
| CORS | preflight `OPTIONS /auth/login` (allowed origin, request headers `content-type,x-mars-csrf`) → `204`, exact ACAO, `Allow-Credentials: true`, `Access-Control-Allow-Headers` includes both | PASS |
| Logout | `POST /auth/logout` with CSRF → `204`; `Set-Cookie` clears `mars_at` (`Expires=Thu, 01 Jan 1970`) | PASS |
| Revocation | pre-logout cookie on `/auth/me` → `401` `Session is no longer valid` | PASS |
| `tokenVersion` | bump `worker.token_version` → live cookie `401` `Session is no longer valid`; restore → same cookie `200` | PASS |
| D1 redirect | admin / pm / worker / viewer login → `200`, `redirectTo=/dashboard`, no token body | PASS |

Server stopped afterwards; port 4000 confirmed closed. The full run is reproducible from [`api-cookie-smoke.log`](evidence/2026-11-09-t13/api-cookie-smoke.log).

---

## 3. Target-contract e2e coverage (`test/auth.e2e-spec.ts`, 20 tests)

| Contract requirement | E2E test(s) |
|---|---|
| Login sets httpOnly `mars_at`, no token in body, correct flags | "sets an httpOnly mars_at cookie and returns no token in the body" |
| D1 `redirectTo=/dashboard` for all roles | `it.each` four role cases |
| AC2 identical generic 401 for wrong password / unknown email / inactive account | three-case `it.each` |
| Login validation 400 (malformed email, missing password, unknown field) | "validates the login payload before touching credentials" |
| CSRF: missing and wrong header → 403; GET unaffected | three tests |
| `/auth/me` from cookie; 401 without cookie; no `Authorization` fallback | three tests |
| Logout 204 + cleared cookie + old cookie 401 + reuse 401 | "revokes the session and clears the cookie on logout" |
| `tokenVersion` mismatch → 401; session not revoked; same cookie works after restore | "rejects a token whose tv no longer matches users.token_version" |
| CORS allowed exact ACAO + credentials; disallowed no ACAO; preflight headers | three tests |
| Health with real DB | `test/health.e2e-spec.ts` |

The suite runs against the live development database `raf_pms` (the file says so, and the session-row delta confirms it: 21 → 30 after the run). No user/credential rows are created; the `token_version` bump is restored in `finally` and all accounts ended at `0`.

---

## 4. Static checks

| Check | Result |
|---|---|
| No `Bearer` text in `src/`, `test/`, or `docs/api-contract-us01.md` | PASS — none |
| No header-auth fallback in production code; `Authorization` appears only in the negative e2e test | PASS — the only references are `test/auth.e2e-spec.ts:213,219` ("ignores the Authorization header") |
| No token/`tokenType` in any response body; occurrences are only negative assertions/property checks in tests | PASS |
| Three transition shims removed | PASS — `src/database/`, `src/users/postgres-users.repository.ts`, `src/sessions/postgres-sessions.repository.ts` are gone |
| `AuthModule` points directly at `PrismaModule` / `Prisma*Repository` | PASS (`src/auth/auth.module.ts`) |
| No `pg` / `@types/pg` / `DATABASE_POOL` references | PASS |
| `cookie-parser` added and applied in shared `configureApp` (server and e2e) | PASS (`cookie-parser` + `@types/cookie-parser` in `package.json`; `src/app.setup.ts:18`) |
| Contract v2 contains no Bearer and documents cookies/CSRF/`/dashboard`/health | PASS (`docs/api-contract-us01.md` v2) |
| No token, cookie or password in T13 evidence logs | PASS (scanned) |

---

## 5. Per-AC verdicts (API portion only)

| AC | API evidence | Status |
|---|---|---|
| **US01 AC1** — valid credentials grant access + role-aware redirect | Login `200` with `mars_at` flags; body `user.role` + `redirectTo=/dashboard`; four role cases; no token body; smoke 25/25 | **PASS (API)** — frontend role rendering/redirect is Member 3 and **pending** |
| **US01 AC2** — generic invalid-credentials error, no field disclosure | Three-case e2e (`wrong password`, `unknown email`, `inactive`) all identical generic `401` body | **PASS (API)** |
| **US01 AC3** — logout ends the session | Logout `204`, cookie cleared, session revoked in DB, old cookie `401`; reusing the old cookie `401` | **PASS (API)** — frontend return to `/login` is Member 3 and **pending** |
| **US01 AC4** — unauthenticated protected access redirected to login | `/auth/me` without cookie → `401`; `Authorization` header without cookie → `401` (no fallback) | **PASS (API)** — frontend route guard redirect is Member 3 and **pending** |
| D1 redirect target | `redirectTo=/dashboard` for all four roles | **PASS (API)** |
| `tokenVersion` invalidation | bump → `401`; restore → same cookie `200` | **PASS (API)** |
| Cookie flags (dev) | `HttpOnly`, `Path=/`, `Max-Age`, `SameSite=Lax`, no `Secure` | **PASS (local dev)** |
| Cookie flags (staging) | requires `Secure` + `SameSite=None` behind Vercel→Railway | **DEFERRED (no staging)** |
| CSRF | missing/wrong → `403`; present passes; no exemptions | **PASS (API)** |
| CORS | exact ACAO + `Allow-Credentials: true`; disallowed gets none; preflight allows `X-MARS-CSRF`/`Content-Type` | **PASS (API)**; real cross-site browser check still `DEFERRED (no staging)` |
| Boot validation | wildcard CORS rejected; `SameSite=None` without `Secure` rejected — both verified by actual boot attempts | **PASS** |
| `/health` | `200 {status:"ok", db:"up"}` with real DB; 503 path unit-tested with a rejecting mock (not force-failed on the live DB) | **PASS (API/local)** |
| No token in body / no password hashes | login, `/auth/me`, logout responses; e2e assertions | **PASS (API)** |

---

## 6. Defects

**None found in the US01 API contract.** All target-contract assertions passed independently; there is no Bearer fallback, no token in the JSON body, no shim or `pg` residue.

Two test-hygiene gaps are recorded as observations rather than T8 defects because T8's acceptance did not include them, but they matter before the CI/staging gate:

| ID | Area | Observation | Suggested action |
|---|---|---|---|
| OBS-1 (risk, P2) | Local e2e database isolation | `npm run test:e2e` runs against the **live development database `raf_pms`** and leaves **session rows** behind: 21 → 30 after this run (24 unrevoked at that point), growing on every run. Users/credentials are untouched and `token_version` is restored, but sessions accumulate for demo accounts. Plan §14.3 expects a throwaway/truncated DB in CI. | In CI use a disposable Postgres DB; locally reseed/truncate `raf_pms` sessions before the demo, or point e2e at `raf_pms_test` + seed. At minimum document that e2e mutates dev sessions. |
| OBS-2 (risk, P3) | E2E credential source | `test/auth.e2e-spec.ts` falls back to the documented demo password if `SEED_PASSWORD` is absent (`process.env.SEED_PASSWORD ?? <documented demo password>`). If the seed password changes, the failure mode is confusing. | Fail fast when `SEED_PASSWORD` is missing rather than using a literal fallback. |
| OBS-3 (test gap, P3) | Token tampering/expiry e2e | Plan §16.3 lists `/auth/me` with a tampered/expired JWT → `401`; the new e2e covers missing token and wrong `tv` but not tampered/expired JWT. The guard handles it (`verifyAsync` catch), but there is no test. | Add tampered/expired-token cases in the Phase-2 CI follow-up. |
| OBS-4 (noise) | Server log | With empty Observe credentials the app logs external telemetry rejection (401/429) at startup; non-fatal and unrelated to auth. | Disable/unset Observe in local dev or accept the noise. |

**T15 closure:** OBS-1 closed (e2e now isolated on `raf_pms_e2e`; dev counts unchanged), OBS-2 closed (`SEED_PASSWORD` required; no demo-password fallback in tests), OBS-3 closed (tampered/expired/role-change e2e added and mutation-verified). OBS-4 remains environmental noise. See [`verification-us01-review-fixes.md`](verification-us01-review-fixes.md).

---

## 7. Remaining limits (honest scope)

1. **Frontend portions of AC1/AC3/AC4 are not implemented** (`/login`, route guard, logout redirect) — Member 3 owns them; the API portions verified here do not close those ACs.
2. **Staging cookie flags / real cross-site CORS** remain `DEFERRED (no staging)`: `Secure` and `SameSite=None` cannot be exercised until Vercel→Railway exists.
3. **Local e2e mutates the dev DB sessions** (OBS-1); CI must use a throwaway DB (plan §14.3).
4. **US18/US19 and change-password/forgot/reset are out of T8 scope** and remain `not yet implemented`; no email/reset evidence is claimed.
5. **No CI run.** All results are local Node 26; CI is Node 24 and has not run this branch.
6. Rate limiting (D9) remains absent and is a known gap, not a T8 defect.

---

## 8. Verdict

**PASS (API).**

Justification: lint 0/0 on 46 files, unit **40/40**, target-contract e2e **22/22** (with the live DB), real-DB suite **22/22**, build green; boot rejects `CORS_ORIGIN=*` and `SameSite=None` without `Secure`; a 25/25 live curl smoke proves the cookie flags, absence of a token body, `/auth/me` cookie-only access, CSRF 403 enforcement on login and logout, no `Authorization` fallback, exact credentialed CORS + preflight, logout clearing + session revocation, `tv` mismatch invalidation, `/health` DB check, and `redirectTo=/dashboard` for all four roles. Static checks confirm the shims and `pg` are gone and neither code nor contract contains Bearer text.

Conditions: frontend redirects (AC1/AC3/AC4), staging cookie flags and the CI run remain pending; local e2e leaves session rows in `raf_pms` (OBS-1). The full ACs are not claimed.

---

## 9. Reproducibility

```bash
cd /home/anoshizuku/Projects/scaffold/backend/app
npm run lint && npm test && npm run test:e2e && npm run test:db && npm run build

# boot rejections (expect exit 1)
CORS_ORIGIN='*' PORT=4020 node dist/main.js
COOKIE_SAMESITE=none COOKIE_SECURE=false PORT=4020 node dist/main.js

# live smoke: start `node dist/main.js` on 4000, then use a cookie jar:
#   POST /auth/login  (X-MARS-CSRF: 1)  -> 200, Set-Cookie mars_at, no token body
#   GET  /auth/me     (cookie)          -> 200;  without cookie -> 401
#   POST /auth/login / /auth/logout without X-MARS-CSRF -> 403
#   GET  /auth/me with Authorization only -> 401 (no fallback)
#   GET  /auth/me with Origin allowed -> exact ACAO + ACAC:true; evil origin -> no ACAO
#   OPTIONS /auth/login preflight -> X-MARS-CSRF allowed
#   POST /auth/logout (CSRF) -> 204 + cleared cookie; old cookie -> 401
#   bump+restore worker.token_version via psql -> old cookie 401 then 200
# Never print the SEED_PASSWORD, the JWT or the cookie value.
```

| Evidence artifact | Contents |
|---|---|
| [`evidence/2026-11-09-t13/lint.log`](evidence/2026-11-09-t13/lint.log) | 0 warnings / 0 errors, 46 files |
| [`evidence/2026-11-09-t13/unit-test.log`](evidence/2026-11-09-t13/unit-test.log) | 40/40 unit tests |
| [`evidence/2026-11-09-t13/e2e-test.log`](evidence/2026-11-09-t13/e2e-test.log) | 22/22 target-contract e2e (live DB) |
| [`evidence/2026-11-09-t13/test-db.log`](evidence/2026-11-09-t13/test-db.log) | 22/22 real-Postgres suite (`raf_pms_test`) |
| [`evidence/2026-11-09-t13/build.log`](evidence/2026-11-09-t13/build.log) · [`build-artifact.txt`](evidence/2026-11-09-t13/build-artifact.txt) | build exit 0, ESM output |
| [`evidence/2026-11-09-t13/boot-validation.log`](evidence/2026-11-09-t13/boot-validation.log) | wildcard CORS + insecure SameSite=None rejected |
| [`evidence/2026-11-09-t13/api-cookie-smoke.log`](evidence/2026-11-09-t13/api-cookie-smoke.log) | 25/25 live API smoke (no secrets) |
| [`evidence/2026-11-09-t13/raf_pms-baseline.log`](evidence/2026-11-09-t13/raf_pms-baseline.log) · [`raf_pms-after-e2e.log`](evidence/2026-11-09-t13/raf_pms-after-e2e.log) · [`raf_pms-final-state.log`](evidence/2026-11-09-t13/raf_pms-final-state.log) | 6 users, 5 credentials, tv restored, session-row accumulation |
| [`evidence/2026-11-09-t13/static-checks.log`](evidence/2026-11-09-t13/static-checks.log) | Bearer/shims/pg/token-body checks |
| [`evidence/2026-11-09-t13/git-status.log`](evidence/2026-11-09-t13/git-status.log) | T8 scope snapshot + QA docs |

Honesty checklist:

- [x] Every command/result above was actually run in this environment; exit codes and key output recorded.
- [x] No seed password, JWT or cookie value is printed in this document or the evidence logs (scanned; the smoke parsed flags only).
- [x] AC1/AC3/AC4 are explicitly **API-only** PASS; frontend redirects are not claimed.
- [x] Staging cookie flags and cross-site browser CORS remain `DEFERRED (no staging)`.
- [x] e2e's dev-DB residue (session rows) is reported, not hidden.
- [x] No source edits, schema changes, or Git writes were made by QA; the server and DB bump were stopped/restored.
