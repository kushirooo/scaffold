# US19 review — password reset, change-password, policy and frontend alignment

| Field | Value |
|---|---|
| Reviewer | `reviewer` (read-only on source) — 2026-11-14 |
| Backend | `feat/us19-backend` @ `988dc0c` vs `main` @ `f6dc087` — 40 files, +13619/−102 |
| Frontend | `fix/us19-frontend-contract` @ `569924f` vs `main` — 2 files, +77/−26 |
| `[OPEN-1]` | AC3 reviewed only as the agreed deviation — 12–128 code points after NFKC, no character classes, exact bundled blocklist — *met per agreed deviation, pending SM amendment*. No literal-AC3 claim found in code, tests, contract or evidence. |

**Verdict: PASS** — no blocking findings. Two non-blocking P3 notes below; nothing needs to change before the Lead pushes.

All eight §6 rubric dimensions were checked; none failed outside the P3 notes. Scope call: every changed path
maps to US19 tasks; the `.env.example`/CI lines are Lead commit `23546b7`, not implementer drift; no schema,
migration or other story's code changed. The frontend branch was reviewed statically only (switching branches
is forbidden for this review), so its lint/build result remains the T8 report plus CI.

## Findings

- **P3** `backend/app/src/auth/password-recovery.service.ts:266` — the admin alert interpolates an arbitrary
  `errorMessage` (`errorMessageOf`, line 44). Today `EmailSendError` messages are generic, so no leak exists;
  but the AC "the alert never contains the token or reset URL" then depends on adapter discipline, not
  redaction — a transport error echoing the rendered body would put the link into a retained admin email.
  **Fix:** send only `errorName`/`stage` (or redact `resetUrl`/token-shaped text) and add a template test
  whose input error message contains the reset URL.
- **P3** `docs/api-contract-us18-us19.md:280` — suite counts are stale at the reviewed head:
  `auth-reset.e2e-spec.ts` is 25 tests (doc says 22), `test:db` 43 per `verification-us19.md` (doc says 42),
  `test:e2e` 55 (doc says 52); `npm test` 150 is current. **Fix:** refresh the four numbers or drop the
  per-command counts and leave `docs/qa/verification-us19.md` as the single tally.

## Reviewer checks (targeted only; full suites are CI's and the Lead's)

- Tree: `git branch --show-current` → `feat/us19-backend`, clean before and after; no branch switch, no git writes.
- `npx vitest run src/auth/password-policy.spec.ts src/auth/password-hasher.spec.ts src/auth/reset-token.service.spec.ts src/email/templates/admin-alert.template.spec.ts` → 4 files, **50/50** (policy matrix incl. 11/12/128/129, NFKC counting, fullwidth/uppercase blocklist, token hash/TTL, alert copy).
- `npx vitest run --config ./vitest.config.db.ts test/db/password-recovery.repository.db-spec.ts test/db/reset-tokens.repository.db-spec.ts` → **21/21** on `raf_pms_test` (reset/change transactions, sibling-token kill, no auto-login, concurrency one-winner).
- `npx vitest run --config ./vitest.config.e2e.ts test/auth-reset.e2e-spec.ts -t …` on `raf_pms_e2e` → **6/6** selected: expired/used/unknown/inactive share the exact generic 400, change rotates cookie and old/second-device cookies 401 while the new one gets `/auth/me` 200, token/password/hash absent from bodies and captured logs, concurrent same-token exactly one winner, token-issue/send-failure alerts.
- Provenance: blocklist 73 026 bytes / 10 001 lines, sha256 `68782d6a…fdcce` and `LICENSE-SecLists.txt` `3dbdc93d…ded66c` match `docs/third-party-notices.md`; `dist/auth/data/` holds both assets after build, so the `nest-cli.json` asset rule works.
- Frontend (static): base `http://localhost:4000`, `X-MARS-CSRF: 1` + `credentials: "include"` on both POSTs, body `{token,newPassword}`, 204-before-JSON forgot, exact-message expired branch, client 12-code-point NFKC minimum, `/login` CTA, `Referrer-Policy: no-referrer`, no console logging, no new deps — matches contract §6 and k213.

## 2026-11-15 — STAB-US19 adversarial review (task-4, kanban k342)

| Field | Value |
|---|---|
| Tree reviewed | `stabilize/stab-us19` working tree vs `3cde2d2` (uncommitted; Lead owns the commit) |
| Files | `backend/app/src/auth/{forgot-password-rate-limiter.ts,.spec.ts,password-recovery.service.ts,reset-token.service.ts,.spec.ts,auth.module.ts}`, `backend/app/src/reset-tokens/*`, `backend/app/test/{auth-reset,user-management}.e2e-spec.ts`, `backend/app/test/db/password-recovery.repository.db-spec.ts`, US19 contract + QA docs |
| Checks | read-only `git diff`/`status`; scoped source/doc read; counts cross-checked against the suite (27 tests / 14 forgot cases in `auth-reset.e2e-spec.ts`, 8 e2e files); no suite re-run; no source edited |
| **Verdict** | **PASS WITH CHANGES** — 2 MINOR, 5 NIT; nothing blocking |

Findings (order = severity):

1. `docs/api-contract-us18-us19.md:242` — **MINOR** — §5 lists the process-local/floor/cleanup limits but omits the targeted consequence of per-address throttling: any unauthenticated client can spend a target address's 5/15 min allowance, after which the victim's own forgot request is a silent `204` with no email for up to 15 min (no existence leak, but a reset lockout). Fix: state it as a deliberate limitation (and/or note a per-IP backstop as later work).

2. `backend/app/src/auth/forgot-password-rate-limiter.spec.ts:120-134` — **MINOR** — "does not extend the window on over-limit attempts" cannot fail if `record` appended a hit on the limited path: the single limited call at W/2 still unblocks at W under either implementation, so the no-extension behaviour is unverified. Fix: issue over-limit calls throughout the window (e.g. every W/15) and assert `limited` at W−1 / `allowed` at W.

3. `backend/app/src/accounts/welcome-email.service.spec.ts:27` — **NIT** — its `RecordingResetTokensRepository implements ResetTokensRepository` is outside the declared write scope and was not updated: every welcome-email test that calls `handleAccountCreated` now hits the missing `pruneExpiredAndUsed`, so issuance takes the fail-open branch and logs `reset_token_prune_failed` (the fake also still lacks `findByTokenHash`). Fix: add a one-line `pruneExpiredAndUsed(): Promise<number> { return 0; }` stub with Lead scope approval, so the US18 tests exercise a successful prune.

4. `backend/app/test/auth-reset.e2e-spec.ts:450-489` + `backend/app/src/auth/forgot-password-rate-limiter.spec.ts:267-316` — **NIT** — the 5-cap is only tested sequentially; the "synchronous `record` cannot interleave" reasoning is sound but the concurrent case is unproven. Fix: `Promise.all` of LIMIT+1 `forgotPassword` calls (fake timers) asserting exactly LIMIT lookups/sends.

5. `backend/app/src/auth/forgot-password-rate-limiter.spec.ts:136-150` — **NIT** — the cap test proves the 10 000 bound but no test exercises `sweepExpired` reclamation (it can be deleted with the suite still green). Fix: after a full window, record another address and assert `trackedEmailCount` drops to 1.

6. `docs/qa/verification-us19.md:72` — **NIT** — "limit 5 is above the suite's max 2 forgot calls per address" is now false: the new rate-limit e2e itself makes 7 calls on one address. Fix: "above the other tests' max 2".

7. `docs/api-contract-us18-us19.md:310-311` — **NIT** — open item 2 ("rate limiting for forgot-password (and login)") is struck through wholesale, although §5 still says login and welcome-resend are unthrottled, so that residual disappears from the open list. Fix: keep a reduced open item for login/resend throttling.

No findings on: secrets/PII (throttle log is `{event,windowLimit,windowMs}` only; prune log carries `errorName`; no email/token in any new log or response); guard/session/CSRF/cookie items are N/A (no auth or route change); real behaviour (e2e on `raf_pms_e2e`, DB spec on real Postgres; prune deletes expired+used rows, keeps the valid/just-issued row, and is fail-open on a repository error; replaying the pruned US02 resend link returns the generic `400`; auth-reset fixtures seeded directly so prune cannot mask them); no new dependency, schema or migration; `[OPEN-1]` remains a pending SM amendment with literal AC3 not claimed, staging/Mailtrap DEFERRED; reported counts are consistent with the files (27 tests / 14 forgot cases, 8 e2e files).

Verdict: PASS WITH CHANGES
