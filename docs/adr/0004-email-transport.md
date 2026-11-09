# ADR 0004 — Email transport and failure semantics

| Field | Value |
|---|---|
| Status | Accepted — D6, D7, D8; US18 AC2 wording pending `OPEN-1` |
| Date | 9 November 2026 |
| Decisions | D6 (INVITE 24 h / RESET 15 min), D7 (Mailtrap, no Mailhog), D8 (Resend via `fetch`, no SDK) |
| Plan references | `SPRINT1_PLAN.md` §4 OPEN-1, §5, §8, §9.1, §10, §11, §20 R3 |
| Related | ADR 0003 (password/reset policy), [decision log](README.md), [third-party notices](../third-party-notices.md) |

## Context

Two transactional emails ship in Sprint 1: the US18 welcome/activation email and the US19
reset email, plus a best-effort admin alert when either fails. There is no Docker daemon
and no local mail service (`COLLABORATION.md` §8), so Mailhog is not available even if it
were in scope. US18 AC3 requires that a failed send must not undo account creation, which
makes send-on-commit ordering the core design constraint rather than an implementation
detail (`SPRINT1_PLAN.md` §8.3). US18 AC2 still says "initial credentials"; the agreed
deviation is a single-use link, no password, tracked as `OPEN-1`.

## Decision

1. **Transport selection.** `EMAIL_TRANSPORT` is one of `smtp` | `resend` | `memory`.
   Local dev uses `smtp` (Mailtrap sandbox); tests and CI use `memory` (in-process array,
   assertions only, never real mail); staging/demo uses `resend`. `memory` is the default
   when `NODE_ENV=test`, so a missing variable cannot send real mail in CI
   (`SPRINT1_PLAN.md` §10.1).
2. **Mailtrap in development (D7).** `nodemailer` against
   `sandbox.smtp.mailtrap.io:587`, `secure: false`, `requireTLS: true`, and 10 s
   connection/greeting/socket timeouts. Credentials come from the password manager and
   only from environment variables. No Mailhog container: Docker Compose is out of scope.
3. **Resend in staging (D8).** `POST https://api.resend.com/emails` via `fetch` with a 10 s
   `AbortSignal.timeout`; no SDK, so there is no ESM packaging risk. Non-2xx responses map
   to a typed `EmailSendError` carrying status and provider message. 429 is logged as a
   provider rate limit and is not retried in Sprint 1.
4. **Non-atomic failure semantics.** The owning transaction commits first, then the
   `account.created` event is emitted (or the handler is called directly) **after commit**,
   never inside the transaction. The handler never throws: on send failure it logs a
   structured `welcome_email_failed` event (user id, email, error name, correlation id —
   never the token or password), then attempts one admin alert to `ADMIN_ALERT_EMAIL`, then
   returns `{ status: 'failed' }`. The account persists and the creating request succeeds.
   If the admin alert itself fails, it is logged and the chain stops — no recursion
   (`SPRINT1_PLAN.md` §8.3–§8.4, §10.4).
5. **Token rules (D6).** One `password_reset_tokens` table with `purpose` (`INVITE` 24 h,
   `RESET` 15 min); raw token = 32 random bytes base64url, stored only as SHA-256; the link
   is `${FRONTEND_URL}/reset-password?token=…`; re-issuing an INVITE marks the user's
   previous unused INVITE tokens used so at most one link is live. Tokens and message
   bodies are never logged (`SPRINT1_PLAN.md` §8.2, §9.4).
6. **Configuration.** Missing email configuration fails fast in production; development
   falls back to a log-only `memory` sender with a warning. Secrets live in Railway env
   only, never in Git; `MAIL_FROM` is consistent across dev and staging so screenshots are
   comparable (`SPRINT1_PLAN.md` §10, §15.5).

## Consequences

- Email is a side effect after the source of truth, not a participant in it: a provider
  outage loses a message but never an account or a user's new password.
- Delivery is fire-and-forget within the request. There is no queue, no retry, no bounce or
  webhook handling and no delivery guarantee; the admin alert is best-effort. Those are
  Sprint 2+ candidates and are stated, not hidden.
- The demo therefore needs a real receiving inbox: Mailtrap for development and either a
  verified Resend domain or Resend's test sender (which delivers only to the account
  owner). If no domain is verified by Day 7, the limitation is stated in the review rather
  than faking evidence (R3; `SPRINT1_PLAN.md` §10.3).
- Tests can assert on `memory` deterministically, and a throwing fake sender is the
  fixture that proves US18 AC3 (user persists, one admin alert, one error log, no rethrow).
- **`OPEN-1` dependency.** Evidence, review and demo wording must say the welcome email is
  link-only "per the agreed deviation, pending SM amendment", and must not claim US18 AC2
  literally satisfied before ratification (`SPRINT1_PLAN.md` §4, §8.1).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Mailhog container | Docker Compose is out of scope and Docker is unavailable; hosted Mailtrap needs no local service (D7) |
| Resend Node SDK | Extra dependency and ESM packaging risk; the REST call is small (D8) |
| Real SMTP for staging/demo | Deliverability to real inboxes, SPF/DKIM and demo evidence are the point; a sandbox cannot prove them |
| Send inside the creation transaction, roll back on failure | Violates US18 AC3: a provider outage would delete a valid account |
| Retry queue / outbox in Sprint 1 | Adds a queue and worker to a ten-day plan; failure is logged and alerted, and the seam is already idempotent |
| Put the temporary password in the welcome email | The `OPEN-1` deviation explicitly replaces credentials with a single-use link; also leaks a secret in email |
