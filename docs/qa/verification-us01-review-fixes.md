# Independent Re-verification — US01 Review Fixes (T14)

| Field | Value |
|---|---|
| Task | `task-15` — QA re-verification of the T14 US01 review fixes; not a full re-review |
| Fix implemented by | `backend-dev` (T14) |
| Verified by | `qa-engineer` (independent reproduction) |
| Date / time | 2026-11-09 13:36–13:44 +08 (Asia/Kuala_Lumpur) |
| Repository | `scaffold` — branch `feat/prisma-foundation`, HEAD `40540e9`; T8+T14 changes are **uncommitted in the working tree** (Lead owns the commit) |
| Environment | Agent sandbox — local PostgreSQL 18.6 at `127.0.0.1:5432`; Node v26.13.0, npm 12.2.2, Prisma 6.19.3 |
| Databases | `raf_pms` (dev — must stay untouched by e2e), `raf_pms_e2e` (new dedicated e2e DB), `raf_pms_test` (DB suite) |
| Baseline for this document | [`verification-us01-cookies.md`](verification-us01-cookies.md) (T13) + `docs/reviews/us01-cookie-reconciliation-review.md` (T12, `PASS WITH CHANGES`) |
| Verdict | **PASS** — F1–F4 closed, T13 OBS-1/OBS-2 closed; 0 defects; the CI e2e wiring and the frontend/staging items remain pending |

**What this PASS means:** the review's test-hardening and isolation gaps are genuinely closed. `npm run test:e2e` now targets a dedicated `raf_pms_e2e` database and never touches `raf_pms`; the guard refuses `raf_pms`; the new tampered/expired/role-change e2e cases and the `AuthCookies` set/clear spec are mutation-resistant (they fail when the guard/role/clear logic is broken in a throwaway copy); contract drift around `Expires`, clock wording, US02/D4 and `ALLOW_DEMO_SEED` is corrected; and the T13 cookie/CSRF/CORS/`tokenVersion` behaviour is unchanged.
**What it does not mean:** the CI workflow still has to create `raf_pms_e2e` and run `test:e2e` (documented prerequisite, no CI run yet); the frontend redirects and staging cookie flags remain pending as in T13. No production behaviour was changed by T14 (delta is tests/config/contract only).

No source was edited during verification; mutation testing ran in a throwaway `/tmp` copy whose source digest was identical before and after. No seed password, JWT or cookie value was printed; evidence logs were scanned for credential strings.

---

## 1. Commands and results

Run from `/home/anoshizuku/Projects/scaffold/backend/app` unless stated.

| # | Command | Exit | Result | Evidence |
|---|---|---|---|---|
| 1 | `npm run lint` | 0 | `Found 0 warnings and 0 errors.` · **50 files** (was 46; +AuthCookies spec, +e2e setup files) | [`lint.log`](evidence/2026-11-09-t15/lint.log) |
| 2 | `npm test` | 0 | `Test Files 9 passed (9)` · **44/44** (was 40; +4 `AuthCookies`) | [`unit-test.log`](evidence/2026-11-09-t15/unit-test.log) |
| 3 | `npm run test:e2e` | 0 | `[e2e] database: raf_pms_e2e at 127.0.0.1:5432` · `Test Files 3 passed (3)` · **25/25** (auth 23 = 20 + tampered/expired/role-change) | [`e2e-test.log`](evidence/2026-11-09-t15/e2e-test.log) |
| 4 | `raf_pms` counts before/after e2e | — | **6 users / 53 sessions / 5 credentials before and after** — unchanged | [`e2e-isolation.log`](evidence/2026-11-09-t15/e2e-isolation.log) |
| 5 | Guard: `E2E_DATABASE_URL=<raf_pms URL> npm run test:e2e` | **1** | `Error: Refusing to run e2e against the development database "raf_pms"…`; **no tests run**; `raf_pms` counts still 6/53/5 | [`e2e-guard.log`](evidence/2026-11-09-t15/e2e-guard.log), [`e2e-guard-full.log`](evidence/2026-11-09-t15/e2e-guard-full.log) |
| 6 | `npm run test:db` | 0 | `Test Files 4 passed (4)` · **22/22** against `raf_pms_test` | [`test-db.log`](evidence/2026-11-09-t15/test-db.log) |
| 7 | `npm run build` | 0 | build exit 0; ESM `dist/main.js` | [`build.log`](evidence/2026-11-09-t15/build.log), [`build-artifact.txt`](evidence/2026-11-09-t15/build-artifact.txt) |
| 8 | Live behaviour smoke on 4000 against `raf_pms_e2e` (T14 build) | 0 | `RESULT: PASS (18/18 checks)`; `raf_pms` unchanged 6/53/5 | [`behavior-smoke.log`](evidence/2026-11-09-t15/behavior-smoke.log), [`post-state.log`](evidence/2026-11-09-t15/post-state.log) |
| 9 | Mutation matrix on throwaway copy (§3) | — | baseline unit 4/4 + e2e 25/25; **5/5 mutations caught**; original source digest unchanged (`4630a7f1…`) | [`mutation-testing.log`](evidence/2026-11-09-t15/mutation-testing.log) |
| 10 | Static/contract checks (§5) | 0 | hardcoded demo password absent from tests/src/prisma; `SEED_PASSWORD` required; contract patches present | [`static-checks.log`](evidence/2026-11-09-t15/static-checks.log) |

---

## 2. e2e database isolation (F3 / T13 OBS-1) — CLOSED locally

- `vitest.config.e2e.ts` runs `globalSetup: ['./test/e2e/global-setup.ts']` and `setupFiles: ['./test/e2e/setup.ts']`.
- `test/e2e/support/e2e-environment.ts` resolves `E2E_DATABASE_URL` (default `postgresql://…@127.0.0.1:5432/raf_pms_e2e`) and **throws before any mutation** when the database name is `raf_pms`; `test/e2e/setup.ts` applies that `DATABASE_URL`/fixed e2e `SEED_PASSWORD` in every worker before `AppModule` is evaluated.
- `global-setup.ts` applies `prisma migrate deploy`, clears stale sessions, resets `token_version`, and seeds the six demo accounts with a fixed **e2e-only** password.
- Reproduced run: the log prints `[e2e] database: raf_pms_e2e`; `raf_pms` was **6/53/5 before and after** (Lead's expected counts); the e2e DB was 6/12/5 and is the only database mutated.
- Guard reproduction: `E2E_DATABASE_URL=<raf_pms>` → exit 1 with `Refusing to run e2e against the development database "raf_pms"`, no test files run, `raf_pms` still 6/53/5.
- Residual note (P3): the guard is **name-based** (`raf_pms` exact name). A URL pointing at the dev server under a different DB name would not be detected, so CI must not pass a staging/demo URL to `E2E_DATABASE_URL`.

**F3 verdict: CLOSED locally** — CI still must create `raf_pms_e2e` and run the suite (contract documents this); no CI run is claimed.

---

## 3. New test quality — do they assert behaviour, not mock calls?

### 3.1 New e2e cases (`test/auth.e2e-spec.ts`, auth 20 → 23)

| Case | What it does | Assertion | Strength |
|---|---|---|---|
| tampered JWT cookie | flips the last 6 chars of the real JWT signature, sends it as `mars_at` | `/auth/me` → `401` **and** body message `Invalid or expired access token` | Real HTTP response + status; fails if signature verification is bypassed |
| expired JWT cookie | decodes the real token, re-signs the same claims with `expiresIn: -10` | `/auth/me` → `401` **and** `Invalid or expired access token` | Real HTTP response + status; fails if expiry is not enforced |
| role-change invalidation | logs in as `viewer`, sets DB role to `WORKER`, sends old cookie | `/auth/me` → `401` **and** `Session is no longer valid`; role restored in `finally` | Real DB mutation + restore; fails if the guard stops comparing DB role |
| clear-cookie flags (in logout test) | logout with CSRF after a real login | clearing `Set-Cookie` contains `mars_at=;`, 1970 expiry, `HttpOnly`, `Path=/`, `SameSite=<configured>`, and `Secure` only when configured | Parses the actual response header, not a mock |
| existing cookie/CSRF/CORS/tv/D1 tests | unchanged T13 assertions | dev `Set-Cookie` flags; CSRF 403; exact ACAO/ACAC; `tv` bump → 401/restore → 200; `redirectTo=/dashboard` | Still pass in the new isolated DB |

### 3.2 `AuthCookies` unit spec (`src/auth/auth.cookies.spec.ts`, 4 tests)

- Dev config → `response.cookie('mars_at', token, { httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 3_600_000 })` — exact option object.
- Dev clear → `response.clearCookie('mars_at', { httpOnly, secure, sameSite, path })` — **no** `maxAge`.
- Production-like config (`COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`, TTL 900) → set options `secure: true`, `sameSite: 'none'`, `maxAge: 900_000`; clear preserves all four flags.
- This is not "was cookie called": it asserts every emitted attribute and the absence of `maxAge` on clear.

### 3.3 Mutation challenge (throwaway copy, original source untouched)

| # | Mutation (copy only) | Result | Caught by |
|---|---|---|---|
| 1 | `AuthCookies` set: `httpOnly: false` | tests fail | all 4 `AuthCookies` tests |
| 2 | `AuthCookies` set: `secure: false` forced | tests fail | both production-like set/clear tests |
| 3 | `AuthCookies` clear: flags dropped (`clearCookie(name)` only) | tests fail | e2e "revokes the session and clears the cookie on logout" |
| 4 | JWT guard: `verifyAsync` replaced by `jwt.decode` (no signature/expiry check) | tests fail | e2e "rejects a tampered JWT cookie" + "rejects an expired JWT cookie" |
| 5 | `resolveSession`: remove `user.role !== payload.role` | tests fail | e2e "rejects a cookie after the user role changed" |

Baseline in the copy: unit 4/4, e2e 25/25. **5/5 mutations caught.** Original source digest before/after: `4630a7f1c011c8654c0e3a908e653e75d467a24527b3a7d396c4d56f7707dcee` (unchanged).

---

## 4. Per-finding closure

| Finding | Required change | Evidence | Status |
|---|---|---|---|
| **F1** (T12, Medium) — tampered/expired/role-change e2e missing | Add the three target-contract e2e cases | 3 new e2e tests asserting real `401` + exact messages; mutations 4 and 5 caught | **CLOSED / PASS** |
| **F2** (T12, Low) — clear-cookie flags + no `AuthCookies` unit spec | Assert clear flags incl. prod; add unit spec for dev/prod set+clear | e2e clear assertions now check `HttpOnly`, `Path=/`, `SameSite`, conditional `Secure`; 4 `AuthCookies` tests assert exact option objects; mutations 1–3 caught | **CLOSED / PASS** |
| **F3** (T12, Medium) — e2e ran against `raf_pms`; CI seed/DB gap | Dedicated `raf_pms_e2e` + guard + migrate/seed global setup; document CI prerequisite | §2: run log shows `raf_pms_e2e`; `raf_pms` 6/53/5 before/after; guard exit 1 + no mutation; contract §10 documents `E2E_DATABASE_URL` and the CI prerequisite | **CLOSED locally** — CI job wiring pending |
| **F4** (T12, Low) — contract `Set-Cookie` example omitted derived `Expires` | Include/mark derived `Expires` | Contract line 44–47: example now shows `Expires=<now + 3600 s, e.g. …>` and says Express derives it | **CLOSED / PASS** |
| T12 F5 — session-expiry wording said DB clock | Document application-clock comparison | Contract line 171 now says `expires_at` in the future compared against the **API server's clock** | **CLOSED / PASS** (doc-only) |
| T12 F6 — US02 create/D4 mismatch | Correct the contract note | Contract line 322: `CreateUserInput.passwordHash` is currently required; US02 must make it optional/add invited-user method; schema supports nullable hash | **CLOSED as documentation** — implementation extension remains a US02 prerequisite |
| T12 F7 — `ALLOW_DEMO_SEED` missing from env table | Add the row | Contract env table has `ALLOW_DEMO_SEED` and `E2E_DATABASE_URL` | **CLOSED / PASS** |
| **OBS-1** (T13, P2) — local e2e mutated dev DB sessions | Isolate e2e from `raf_pms` | §2: dedicated `raf_pms_e2e`, guard, migrate/seed; dev counts unchanged | **CLOSED** |
| **OBS-2** (T13, P3) — hardcoded demo-password fallback | Require `SEED_PASSWORD`, no demo fallback | `test/auth.e2e-spec.ts:23-28` throws when absent; no hardcoded demo seed password in `src`/`test`/`prisma`; e2e uses a test-only fixture password | **CLOSED** |
| **OBS-3** (T13, P3) — tampered/expired token test gap | Add cases | Covered under F1 | **CLOSED** |

---

## 5. Contract, static and regression checks

| Check | Result |
|---|---|
| Contract derived `Expires` + statement that it is derived | PASS (`docs/api-contract-us01.md:44-47`) |
| Contract session-expiry wording = app-clock comparison | PASS (`:171`) |
| Contract US02/create + D4 invited-account note | PASS (`:322`) |
| Contract env table has `E2E_DATABASE_URL` and `ALLOW_DEMO_SEED` | PASS (`:285,287`) |
| Contract documents the e2e DB target and CI prerequisite | PASS (`:315`) |
| No hardcoded demo seed password in `src/`, `test/`, `prisma/` | PASS — none; only the contract's documented dev/demo examples contain one |
| `SEED_PASSWORD` required by the e2e suite | PASS — module throws if absent; setup sets the e2e fixture before evaluation |
| T14 delta only tests/config/env-example/contract (no production `src` behaviour change) | PASS — mtime delta: `src/auth/auth.cookies.spec.ts`, `test/auth.e2e-spec.ts`, `test/e2e/*`, `vitest.config.e2e.ts`, `.env.example`; `src/auth/auth.cookies.ts` and other runtime files unchanged by T14 |
| Cookie/CSRF/CORS/`tv` behaviour unchanged from T13 | PASS — live smoke 18/18 (flags, no token body, cookie-only `/auth/me`, CSRF 403 on login/logout, exact ACAO + credentials / none for evil / preflight `X-MARS-CSRF`, logout clear + revocation, `tv` bump → 401 → restore → 200, `/health` up) |
| No `Bearer`/no header fallback/shim or `pg` regression | PASS (unchanged from T13; static greps) |
| `raf_pms` untouched by all T15 commands | PASS — 6/53/5 before, between and after e2e/guard/smoke |

---

## 6. Defects and observations

**No defects found.** All required fixes are present and effective; the mutation matrix confirms the new tests are not status-code theatre.

Residual observations (non-blocking):

| ID | Observation | Handling |
|---|---|---|
| OBS-T15-1 (P3) | The e2e DB guard is **name-based** (`raf_pms`); a URL referencing the dev DB under a different name would not be caught. | Keep `E2E_DATABASE_URL` exclusively for the disposable e2e DB; CI should derive it from the service config, never pass a staging/demo URL. |
| OBS-T15-2 (P3) | CI still does not create `raf_pms_e2e` or run `test:e2e` (plan §14 predates this). | The CI task must add a Postgres service DB and the e2e job step; the contract already states the prerequisite. |
| OBS-T15-3 (Info) | e2e global setup clears sessions and resets `token_version` on its target DB before seeding — correct for `raf_pms_e2e`, dangerous if mispointed. | Same guard/operational note as OBS-T15-1; document in the CI job. |

---

## 7. Remaining limits (unchanged from T13)

1. **Frontend redirects** for US01 AC1/AC3/AC4 are Member 3's and still pending; the ACs remain `PASS (API)`.
2. **Staging cookie flags** (`Secure`, `SameSite=None`) and real cross-site browser behaviour remain `DEFERRED (no staging)`.
3. **CI has not run** any suite; the e2e CI prerequisite is documented but not wired.
4. US18/US19 etc. remain out of scope; no email/reset claims.
5. Login rate limiting (D9) remains a known gap.

---

## 8. Verdict

**PASS.**

- F1/F2/F3/F4 closed; T13 OBS-1/OBS-2/OBS-3 closed locally; F5/F6/F7 contract drift patched accurately.
- `npm run test:e2e` targets `raf_pms_e2e`, leaves `raf_pms` at exactly 6/53/5, and refuses `raf_pms` with exit 1 and no mutation.
- New e2e cases assert real `401` responses and exact messages for tampered, expired and role-changed tokens; the `AuthCookies` spec asserts exact set/clear option objects for dev and production-like configs. 5/5 mutations were caught in a throwaway copy.
- Full green: lint 50 files 0/0, unit **44/44**, e2e **25/25**, DB suite **22/22**, build 0; live cookie/CSRF/CORS/`tv` smoke **18/18** with no behaviour change.
- Conditions: CI must create `raf_pms_e2e` and run e2e; frontend and staging items remain pending. No production source changed in T14.

---

## 9. Reproducibility

```bash
cd /home/anoshizuku/Projects/scaffold/backend/app
npm run lint && npm test && npm run test:e2e && npm run test:db && npm run build

# isolation proof (needs psql + .env)
psql "$DATABASE_URL" -Atc 'select count(*) from users; select count(*) from sessions; select count(*) from credentials;'   # 6/53/5
npm run test:e2e   # log shows [e2e] database: raf_pms_e2e
psql "$DATABASE_URL" -Atc 'select count(*) from users; select count(*) from sessions; select count(*) from credentials;'   # still 6/53/5

E2E_DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)" npm run test:e2e   # exit 1, refusal, no mutation

# behaviour smoke: DATABASE_URL=<raf_pms_e2e URL> node dist/main.js, then cookie jar checks as in T13.
# Never print the seed password, JWT or cookie value.
```

| Evidence artifact | Contents |
|---|---|
| [`lint.log`](evidence/2026-11-09-t15/lint.log) · [`unit-test.log`](evidence/2026-11-09-t15/unit-test.log) | 50 files 0/0; 44/44 unit |
| [`e2e-test.log`](evidence/2026-11-09-t15/e2e-test.log) · [`e2e-isolation.log`](evidence/2026-11-09-t15/e2e-isolation.log) | 25/25 e2e on `raf_pms_e2e`; `raf_pms` 6/53/5 before/after |
| [`e2e-guard.log`](evidence/2026-11-09-t15/e2e-guard.log) · [`e2e-guard-full.log`](evidence/2026-11-09-t15/e2e-guard-full.log) | guard refuses `raf_pms`, exit 1, no mutation |
| [`test-db.log`](evidence/2026-11-09-t15/test-db.log) · [`build.log`](evidence/2026-11-09-t15/build.log) | 22/22 DB suite; build 0 |
| [`behavior-smoke.log`](evidence/2026-11-09-t15/behavior-smoke.log) · [`post-state.log`](evidence/2026-11-09-t15/post-state.log) | 18/18 behaviour checks; server stopped; `raf_pms` unchanged |
| [`mutation-testing.log`](evidence/2026-11-09-t15/mutation-testing.log) | 5/5 mutations caught; source digest unchanged |
| [`static-checks.log`](evidence/2026-11-09-t15/static-checks.log) · [`git-status.log`](evidence/2026-11-09-t15/git-status.log) | contract/env/test checks; T14 delta scope |
| [`versions.log`](evidence/2026-11-09-t15/versions.log) | node/npm/psql/Postgres versions |

Honesty checklist:

- [x] Every command/result above was actually run in this environment; exit codes and key output recorded.
- [x] No seed password, JWT or cookie value appears in this document or the evidence logs (scanned; smoke parsed flags only).
- [x] Mutation testing used a throwaway copy; original source digest unchanged.
- [x] e2e isolation is proven by DB counts, not inferred from logs alone.
- [x] CI, frontend and staging limits are stated, not hidden.
- [x] No source edits, schema changes, or Git writes were made by QA; the API process was stopped and mutated DB role/`token_version` restored.
