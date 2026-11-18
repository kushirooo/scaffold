# ADR 0005 — Gmail API transport for staging email

| Field | Value |
|---|---|
| Status | Accepted — 18 November 2026; supersedes the unimplemented Mailtrap Sandbox API plan |
| Date | 18 November 2026 |
| Decisions | Extends the ADR 0004 transport set with `EMAIL_TRANSPORT=gmail-api` for the deployed demo |
| Plan references | `SPRINT1_PLAN.md` §8, §10 (email transport); ADR 0004 (D7, D8) |
| Related | [ADR 0004](0004-email-transport.md), [decision log](README.md), Railway/Render deployment runbook |

## Context

Sprint 1 needs real welcome/reset email for the deployed demo. The original plan
(ADR 0004) used Mailtrap SMTP for local development and Resend for staging, with a
Mailtrap Sandbox API transport considered as an intermediate step. The deployed
environment changes that calculus:

- The team cannot register a sending domain, so Resend live sending (which needs a
  verified domain) is not available; Resend's test sender can only mail the account owner.
- Railway and Render block outbound SMTP egress, so Mailtrap SMTP cannot be reached
  from the deployed backend even though it works locally.
- Mailtrap Sandbox (SMTP or HTTPS API) traps email in a sandbox inbox: good for a
  demo screenshot, but it is not real delivery and adds a second provider integration.
- Outbound HTTPS is allowed on both hosts, and the team has a Gmail account. The
  Gmail API (`gmail.send` scope) sends over HTTPS with OAuth user credentials and no
  domain setup.

## Decision

1. **New transport.** `EMAIL_TRANSPORT` accepts a fourth non-test value, `gmail-api`,
   alongside `smtp` | `resend` | `memory`. Existing transports and their behaviour are
   unchanged; `memory` remains the test/CI transport and is still forbidden in production.
2. **Credentials.** Required when selected: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` (the authorised Gmail address). Optional:
   `GMAIL_FROM_NAME` (display name; defaults to the display name in `MAIL_FROM`).
   `MAIL_FROM` stays required in production and its address **must equal**
   `GMAIL_SENDER`; a mismatch fails boot so the From header can never claim an
   unauthorised address.
3. **HTTPS, no SDK.** OAuth refresh: `POST https://oauth2.googleapis.com/token`
   (`grant_type=refresh_token`). Send: `POST
   https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with
   `{ "raw": "<base64url MIME>" }`. No `googleapis` client library: it is a large CJS
   dependency and the REST call is small, matching the ADR 0004 D8 rationale for Resend.
4. **Message shape.** The raw message is `multipart/alternative` with both the plain-text
   and HTML alternatives from `EmailMessage` (US18/US19 require the text copy), CRLF line
   endings, base64 body parts, and RFC 2047 encoding when a subject is not printable ASCII.
5. **Header safety.** Every header value is stripped of CR/LF, the display name is
   quoted/escaped, recipients and sender must match a minimal address pattern, and an
   invalid recipient fails the send instead of reaching Gmail. This extends the
   `headerSafe()` defence used by the admin-alert subject to the whole message.
6. **Timeouts and retries.** Each HTTP call is bounded by a 10 s `AbortSignal.timeout`
   (ADR 0004 §10.3). The access token is cached in memory and refreshed 60 s before
   expiry; concurrent sends share one refresh. Exactly one retry is allowed when
   `messages.send` returns 401 (invalidate the cached token, refresh, send again). There
   is no retry for 429/5xx/timeouts — Sprint 1 has no queue or retry loop.
7. **Failure semantics (unchanged).** Failures surface as `EmailSendError` with provider
   `gmail-api`; the owning feature keeps the ADR 0004 behaviour: the account or reset
   request persists, one best-effort admin alert is attempted, one structured log is
   written, and the token/body/recipient are never logged. 429 is logged once as
   `email_provider_rate_limited` without PII.
8. **Operational mode (demo).** The deployed demo runs with the OAuth app in **Testing**
   and `rafconsultpms@gmail.com` on the test-user list: no publishing, verification, domain
   or privacy policy is required, and Testing supports up to 100 test users. Testing refresh
   tokens expire about 7 days after authorisation, so the token is minted close to the demo.
   Publishing to production is not a shortcut: `gmail.send` is a restricted scope, so it
   needs brand and restricted-scope verification (including a CASA security assessment),
   a domain verified in Search Console and a real privacy policy — unverified publishing is
   blocked by those branding prerequisites and would still show the unverified warning with
   a 100-user cap. The app depends on one Gmail account and its ~500-recipient daily
   sending limit; demo recipients must be real addresses (`@rafconsult.test` addresses do
   not exist).

## Consequences

- Staging can send real email with no domain, no SMTP egress and no extra provider,
  at the cost of depending on one team Gmail account and its quota.
- The demo/evidence must say emails come from `rafconsultpms@gmail.com` and respect the
  ~500/day limit; the Testing-mode token rotation is a known operational risk with a
  documented pre-demo checklist. Continuing beyond the demo needs either periodic
  re-authorisation or the verified-domain path.
- Mailtrap Sandbox API is not implemented; the previous plan is superseded rather than
  left half-built. Resend stays in the codebase for a future verified-domain setup.
- If the Gmail account's token is revoked/expired (`invalid_grant`), email fails but
  accounts/reset flows still succeed — the same accepted failure semantics as ADR 0004.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Mailtrap Sandbox API | Traps mail in a sandbox; not real delivery, adds a provider integration that is only useful for a screenshot |
| Mailtrap live sending / Resend live | Requires a verified sending domain the team does not have |
| Mailtrap/Gmail SMTP | Deployed hosts block outbound SMTP; works locally only |
| `googleapis` SDK | Large CJS dependency, ESM/build risk on a free plan for one REST call |
| Google service account with domain-wide delegation | Requires a Workspace domain; the team only has consumer Gmail accounts |
| Publish the app unverified for the demo | Blocked by the branding prerequisites (owned/verified domain + publicly reachable privacy policy); for `gmail.send` it would still require restricted-scope verification and show the unverified warning with a 100-user cap. Testing mode already covers the demo |
| Keep mail to the console for the demo | US18/US19 evidence and a real inbox demo are project requirements |
