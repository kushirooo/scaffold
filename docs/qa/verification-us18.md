# US18 verification — welcome email on account creation

| Field | Value |
|---|---|
| Story | US18 — welcome email on account creation (`[OPEN-1]` amended, AC2 link-only) |
| Status | **PASS (local)** — AC1/AC3 end-to-end through `POST /users`; AC2 met per `[OPEN-1]` deviation; staging/Resend **DEFERRED** |
| Branch | `stabilize/stab-us18` (from `main` @ `b064367`) |
| Environment | local PostgreSQL 18 (`raf_pms_e2e`), Node 26; e2e forces `EMAIL_TRANSPORT=memory`; Lead run uses the dev `.env` Mailtrap SMTP transport |

## AC status

| AC | Status | Evidence |
|---|---|---|
| AC1 — account creation triggers a welcome email | **PASS (local)** — `POST /users` commits account+credential, then emits `account.created` after commit; exactly one welcome email contains `/reset-password?token=` | `test/user-management.e2e-spec.ts` → `creates users, emits the welcome seam and lists last login`; `test/welcome-email.e2e-spec.ts` seamed case |
| AC2 — initial credentials + link, **as amended `[OPEN-1]`** | **PASS (amended wording only)** — link-only, no password; literal AC2 not claimed | welcome template spec + AC1 e2e assertion (`not.toContain(input.password)`) |
| AC3 — send failure: log, alert admin, keep account | **PASS (local)** — account and credential persist, one `welcome_email_failed` log, one admin alert, no rethrow | `user-management.e2e-spec.ts` → `keeps the account committed when the welcome email fails (US18 AC3)`; welcome e2e failure cases |

`[OPEN-1]`: link-only welcome email "per the agreed deviation, pending SM amendment"; literal AC2 is not claimed.

## Commands and results

| # | Command | Result |
|---|---|---|
| 1 | `cd backend/app && npx vitest run --config ./vitest.config.e2e.ts test/user-management.e2e-spec.ts test/welcome-email.e2e-spec.ts` | 2 files, **15/15** pass on `raf_pms_e2e` |
| 2 | `cd backend/app && npm test` | 22 files, **151/151** pass |
| 3 | `cd frontend/app && npm test` | 3 files, **26/26** pass (13 in `lib/user-admin.test.mjs`) |
| 4 | `cd frontend/app && npm run lint` | exit 0, no warnings/errors |
| 5 | `cd frontend/app && npm run build` | `next build` exit 0 (14/14 pages) |

## Behaviour proofs

- **Token hash:** e2e parses the 43-char base64url token from the link and asserts the user's single
  `password_reset_tokens` row stores exactly its SHA-256 hex `token_hash` (`INVITE`, unused, future expiry);
  raw token absent from the row and logs.
- **Failure counts (e2e fake sender):** send throws → 1 welcome attempt + 1 admin alert + 1 `welcome_email_failed`
  log, no rethrow; alert also throws → 2 attempts, `welcome_email_admin_alert_failed`, chain stops; token
  failure (unit) → no email, 1 alert, stage `token`.
- **UI result path:** create/resend copy is pure data in `frontend/app/lib/user-admin.ts`
  (`createUserToast`, `resendSuccessToast`, `resendFailureToast`) attached by `user-management-dashboard.tsx`;
  create says the email is sent **asynchronously** and offers Resend, resend success names the recipient,
  neither claims delivery; `lib/user-admin.test.mjs` locks that wording.

## Lead manual checks (15 Nov 2026)

- **Real Mailtrap SMTP:** app transport options + app template accepted by `sandbox.smtp.mailtrap.io` →
  `250 2.0.0 Ok: queued` (`artifacts/stabilization/100-stab-us18-mailtrap-probe.log`).
- **App path:** admin login → `POST /users` `201` → `POST /users/:id/welcome-email/resend` `200 {"status":"sent"}`;
  INVITE row hash-only; **0** `welcome_email_failed` markers after the create send (`100-stab-us18-app-flow.log`,
  `100-stab-us18-api-app-flow.log`). Mailtrap's free sandbox throttles bursts (`550 … Too many emails per second`),
  so sends were spaced; not an app defect.
- **Production-build browser smoke 11/11 PASS** (`100-stab-us18-smoke.log`, screens `60-stab-us18-created-toast.png`,
  `61-stab-us18-resend-sent-toast.png`): create shows the honest async toast naming the recipient and offering
  Resend (no delivery claim), row appears, real resend `200` shows "Welcome email sent." to the recipient,
  0 console errors, 1 expected login-page `401` session probe; fixture deleted `204`.
- **Not inspectable in DSH:** Mailtrap sandbox inbox content/screenshot (no account login/API token); provider
  acceptance + template/e2e content assertions are the evidence — no inbox claim is made.

## Not claimed / deferred

- **Staging / Resend delivery and staging DB:** **DEFERRED** (no staging deployment; k344 owns it). No staging pass claimed; literal US18 AC2 (credentials in the email) is **not claimed** — `[OPEN-1]` pending SM amendment.
