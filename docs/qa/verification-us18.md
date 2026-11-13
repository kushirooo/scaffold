# US18 verification — welcome email on account creation

| Field | Value |
|---|---|
| Story | US18 — welcome email on account creation (`[OPEN-1]` amended) |
| Status | **PARTIAL** — seam, unit and e2e verified on `raf_pms_e2e`; Mailtrap delivery check and US02 emission pending |
| Branch | `feat/us18-welcome-email` (T5a committed; T5b evidence) |
| Environment | local PostgreSQL 18 (`raf_pms_e2e`), Node 26; e2e harness forces `EMAIL_TRANSPORT=memory`, `EMAIL_SENDER` overridden by an in-test fake |

## AC status

| AC | Status | Evidence |
|---|---|---|
| AC1 — account creation triggers welcome email | **PARTIAL** — handler verified from the `account.created` event; US02's emitting endpoint is not implemented/confirmed | e2e emits `ACCOUNT_CREATED` via `EventEmitter2.emitAsync` → one welcome message |
| AC2 — email contains initial credentials + link **as amended `[OPEN-1]`** | **PASS (amended wording only)** — link-only, no password; literal AC2 not claimed | e2e: link `${FRONTEND_URL}/reset-password?token=…`, login URL, no `$argon2`/password field |
| AC3 — send failure: log, notify admin, keep account | **PASS** | e2e: one `welcome_email_failed` log, one admin alert, user row persists, no rejection |

`[OPEN-1]`: the welcome email is link-only "per the agreed deviation, pending SM
amendment"; US18 AC2 is not presented as literally satisfied before ratification.

## Commands and results

| # | Command (from `backend/app`) | Result |
|---|---|---|
| 1 | `npx vitest run src/accounts` | 2 files, 7/7 pass |
| 2 | `npx vitest run --config ./vitest.config.e2e.ts test/welcome-email.e2e-spec.ts` | 5/5 pass on `raf_pms_e2e` |
| 3 | `npm run test:e2e` | 4 files, 30/30 pass |
| 4 | `npm run lint` | 0 warnings, 0 errors |
| 5 | `npm run build` | `nest build` exit 0 |

## Token-hash proof

The e2e parses the 43-character base64url token from the sent activation link,
computes SHA-256, and asserts the user's single `password_reset_tokens` row
stores exactly that hex `token_hash` (purpose `INVITE`, `used_at` null,
`expires_at` in the future). The raw token is absent from the stored row and
from every captured log line.

## Failure-path counts (e2e, in-test fake sender)

- Welcome send throws: 1 welcome attempt + **1** admin alert to
  `ADMIN_ALERT_EMAILS`; 1 `welcome_email_failed` log (stage `send`); no rethrow.
- Admin alert also throws: 2 send attempts total (no recursion); second log
  `welcome_email_admin_alert_failed`; the chain stops.
- Token failure (unit): no welcome email, 1 alert, stage `token`.

## Pending / not claimed

- **Mailtrap delivery and content screenshot:** the dev `.env` configures
  Mailtrap (`EMAIL_TRANSPORT=smtp`), but the e2e harness forces `memory` and no
  account-creation endpoint exists yet to trigger a real welcome email.
  Delivery/content check pending until US02 emits `account.created`.
- **US02 seam confirmation:** tracked separately; `docs/us02-seam.md` is the
  contract.
- **Staging/Resend:** not attempted in this verification.
