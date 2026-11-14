# US18/US19 — Password lifecycle API contract (v1)

**Stories:** US18 (welcome email with an activation link) and US19 (password reset, password change, password policy).
**Owner:** Backend (implementer) · **Version:** v1 (14 November 2026)
**Status:** Implemented in `backend/app`; local verification green (14 Nov 2026). CI and staging checks are pending.
**Consumers:** Member 3 (portal UI), Member 4 (QA), US02 (account creation), US18 (welcome email)
**References:** `SPRINT1_PLAN.md` §8–§9, §12; [ADR 0003](adr/0003-password-policy.md); [ADR 0004](adr/0004-email-transport.md)

> **[OPEN-1] wording — do not overclaim.** The backlog's US19 AC3 asks for "system
> complexity rules". The implemented policy is the agreed deviation: **12–128 Unicode code
> points after NFKC, no character classes, plus an exact bundled blocklist**. Status:
> *met per agreed deviation, pending SM amendment*. Nothing in this contract, the demo or
> the QA evidence may claim the literal AC3 text is met until the Scrum Master amends the
> backlog (`SPRINT1_PLAN.md` §4, §9.5).

US18/US19 reuse the US01 cookie transport, CSRF rule, session model and generic errors;
this document covers only what these stories add. Read [the US01 contract](api-contract-us01.md)
first: there is **no token in any response body**, `mars_at` is the only auth cookie, and
every non-GET request requires `X-MARS-CSRF: 1`.

---

## 1. Endpoints

Base URL: `NEXT_PUBLIC_API_URL` (local `http://localhost:4000`). Request bodies are
validated by `class-validator` with `whitelist: true, forbidNonWhitelisted: true`, so
unknown fields are rejected with `400`.

### `POST /auth/forgot-password`

Public. **Requires `X-MARS-CSRF: 1`.**

```json
{ "email": "pm@rafconsult.test" }
```

- Email is trimmed, validated (`@IsEmail`, max 254) and lowercased for the lookup.
- **Always `204 No Content`** when the body is valid, whether the email is unknown,
  inactive, invited (no password yet) or an active account. One email is sent only for a
  known, active account. No token is issued for unknown/inactive accounts.
- No `Set-Cookie`; no token or account state in the response. The 204 is the whole
  anti-enumeration guarantee, and the frontend shows "If an account exists, we sent a link".
- If issuing the `RESET` token or sending the email fails: the API logs a structured event
  and sends one best-effort admin alert, then still returns `204`. The alert never contains
  the token or the reset URL.

Malformed email or missing field — `400 Bad Request`:

```json
{
  "message": ["email must be an email"],
  "error": "Bad Request",
  "statusCode": 400
}
```

Missing/wrong CSRF header — `403` (see §5).

The reset email has subject `Reset your RAF CONSULT MARS password` and contains the
single-use link `${FRONTEND_URL}/reset-password?token=<raw-token>` (HTML- and
cr-LF-safe; name and URL escaped). No password, hash or token appears in any log or alert.

### `POST /auth/reset-password`

Public. **Requires `X-MARS-CSRF: 1`.** Accepts both `RESET` (forgot-password, 15 min) and
`INVITE` (US18 welcome, 24 h) links — an invited account can set its first password here.

```json
{
  "token": "<raw token from the link>",
  "newPassword": "a brand new passphrase"
}
```

- `token`: string, 1–256 characters (43-character base64url in practice).
- `newPassword`: checked against the §3 policy before any write.
- **Success — `200 OK` with an empty body.** No `Set-Cookie`: a reset never logs the user
  in. Sign in again with the new password.
- **Failure — `400 Bad Request`, one identical body for every invalid link**: expired,
  already used, unknown or inactive user. (Both link purposes, `RESET` and `INVITE`, are
accepted; there is no third purpose in the schema.) The message is deliberately
  identical for all of them:

```json
{
  "message": "This password reset link is invalid or has expired.",
  "error": "Bad Request",
  "statusCode": 400
}
```

- **Policy failure — `400 Bad Request`** with the policy message (not the link error).
  Validation errors use an array, as with the US01 login DTO:

```json
{
  "message": ["Password must be at least 12 characters"],
  "error": "Bad Request",
  "statusCode": 400
}
```

- The token is only consumed after the policy passes. A policy failure leaves the link
  usable; a valid `200` consumes it and every other unused reset/invite link for the user.
- Concurrent reuse of one link: exactly one request can succeed. The consume is a single
  conditional `UPDATE` inside the reset transaction; the loser gets the generic `400`.

Side effects of a successful reset, in one transaction: the link is marked used, the
credential is upserted (creates the row for invited accounts) with its argon2id hash and
`password_updated_at`, `users.token_version += 1`, **all sessions are revoked**, and every
other unused reset/invite token for the user is marked used.

### `POST /auth/change-password`

Requires the `mars_at` cookie **and** `X-MARS-CSRF: 1` (authenticated mutation).

```json
{
  "currentPassword": "current valid passphrase",
  "newPassword": "another valid passphrase"
}
```

- `currentPassword`: string, 1–1024 characters, verified with the US01 hasher.
- `newPassword`: checked against the §3 policy.
- Wrong current password — **`401 Unauthorized`** with the same generic message as login:

```json
{
  "message": "Invalid email or password",
  "error": "Unauthorized",
  "statusCode": 401
}
```

- Missing/expired/revoked cookie — `401` (`Authentication required`,
  `Invalid or expired access token` or `Session is no longer valid`, as in US01 §6).
- Policy failure — `400` with the policy message array (same shape as reset).
- Missing/wrong CSRF header — `403` (see §5).
- **Success — `200 OK`** with the user and the new token lifetime; **no token in the
  body**:

```json
{
  "user": {
    "id": "0f0b6a4e-...",
    "email": "pm@rafconsult.test",
    "fullName": "Faizal Ibrahim",
    "role": "PROJECT_MANAGER"
  },
  "expiresIn": 3600
}
```

The response rotates the `mars_at` cookie with a new JWT (same flags as US01 §3):

```
mars_at=<new JWT>; Max-Age=3600; Path=/; Expires=<now + JWT_TTL_SECONDS>; HttpOnly; SameSite=Lax
```

Side effects, in one transaction: credential upsert with `password_updated_at`,
`token_version += 1`, **every** session revoked, exactly **one** new session created (its
id travels only in the rotated JWT), and every unused reset/invite token marked used. The
current device stays signed in via the new cookie; the old cookie and any second device's
cookie are rejected on their next request (`401`). The old password no longer logs in; the
new one does.

---

## 2. Tokens and TTLs

| Purpose | TTL | Config | Issued by | Accepted by reset |
| --- | --- | --- | --- | --- |
| `RESET` | 900 s (15 min) | `RESET_TTL_SECONDS` (default 900) | `POST /auth/forgot-password` | yes |
| `INVITE` | 86 400 s (24 h) | `INVITE_TTL_SECONDS` (default 86400) | US18 welcome email | yes |

- Raw token: 32 random bytes as base64url (43 characters, 256 bits).
- At rest: only the SHA-256 hex digest is stored (`password_reset_tokens.token_hash`,
  unique). The raw token exists only in the email link.
- Single use: consumed by a conditional update; expired/used rows are kept as history, not
  deleted (cleanup is a later maintenance task).
- Issuing a token marks the user's previous unused token **of the same purpose** as used:
  a new forgot-password request kills the previous `RESET` link but not a pending `INVITE`,
  and vice versa. A successful reset/change kills all unused links.
- A stale/expired link never errors with anything other than the generic `400`.

## 3. Password policy (agreed deviation, `OPEN-1`)

| Rule | Value |
| --- | --- |
| Minimum | 12 Unicode code points, measured after NFKC normalisation |
| Maximum | 128 code points, measured after NFKC normalisation |
| Character classes | None: no upper/lower/digit/symbol requirements |
| Allowed characters | All, including spaces, emoji, non-Latin scripts and all-lowercase passphrases |
| Blocklist | Exact match after NFKC + lowercase against the bundled SecLists corpus (10001 entries) |
| Hashing | argon2id, 19 MiB, t=2, p=1, over the UTF-8 bytes of the NFKC form |
| Normalisation | NFKC is applied once and reused by set, change and verify |

Policy failure messages (one per violation; the token/session is not touched):

| Violation | Message |
| --- | --- |
| < 12 code points | `Password must be at least 12 characters` |
| > 128 code points | `Password must be at most 128 characters` |
| Blocklisted | `This password is too common` |

The blocklist is exact-match only (not fuzzy, no breach API); its provenance and checksum
are recorded in [third-party notices](third-party-notices.md). This is the agreed
deviation: **met per agreed deviation, pending SM amendment** — not the literal US19 AC3.

## 4. Cookie and CSRF rules

- The only auth cookie is `mars_at` (httpOnly); see US01 §3 for flags and env validation.
  No token is ever returned in a body or stored by the frontend.
- Every non-GET request — including forgot/reset/change — requires `X-MARS-CSRF: 1`.
  Missing/wrong → `403`:

```json
{ "message": "Missing or invalid CSRF header", "error": "Forbidden", "statusCode": 403 }
```

- Forgot and reset set **no** cookie. Change rotates `mars_at`; the old value dies with the
  revoked session and the bumped `token_version`.
- Browser calls use `credentials: 'include'`; the frontend origin must exactly match
  `CORS_ORIGIN` (US01 §5).

## 5. Known gaps and deliberate limitations

- **No rate limiting** on forgot-password: unlimited requests could email-bomb a known
  address. Add throttling before production (also a US01 gap for login).
- **Forgot-password timing is not equalised.** Unknown/inactive emails return before any
  token/email work; a known address does a DB write and a send. This does not change the
  204 status but is not a timing-equalised anti-enumeration guarantee.
- **Exact-match blocklist only.** Long favourites such as `P@ssw0rd!2026` may pass; breach
  corpus lookup (HIBP) and fuzzy matching are out of scope.
- **No token cleanup.** Used/expired token rows are retained; a maintenance job is later
  work.
- **Token in the URL query string by design.** The reset page must set
  `Referrer-Policy: no-referrer`; the API never logs the token.
- **US18 scope:** the welcome/activation email is event-driven (no public HTTP endpoint);
  only its `INVITE` link interacts with this API. Email transport selection is documented
  in ADR 0004.

## 6. Frontend contract (Member 3)

- API base: `NEXT_PUBLIC_API_URL`, local `http://localhost:4000`. Every request:
  `credentials: 'include'`; every non-GET: header `X-MARS-CSRF: 1`.
- Forgot page: `POST /auth/forgot-password`, treat `204` as success and show the generic
  "If an account exists, we sent a link" message. Do not parse the body.
- Reset page (`/reset-password?token=...`): read `token` from the query string, send
  `{ token, newPassword }`; on `400` show the generic link error (or the policy message);
  on `200` route to `/login` with a success notice. Set `Referrer-Policy: no-referrer` for
  this page (the US19 frontend change owns this header).
- Change-password form: send `{ currentPassword, newPassword }`; on `200` the cookie has
  already rotated, show success and stay on the page; on `401` send the user to `/login`
  (generic message for a wrong current password); on `400` show the policy message.
- Never read or store the JWT; there is no token in any body. Display `message` from the
  Nest error body (`{ message, error, statusCode }`; validation `message` is an array).
- Run the flow with `docs/http/sprint1.http` (cookie jar) or the Postman collection
  `docs/http/us01.postman_collection.json`.

## 7. Acceptance criteria → evidence

| AC | Evidence |
| --- | --- |
| Forgot always `204` for known/unknown/inactive/invited; one email only for known active | `test/auth-reset.e2e-spec.ts` — forgot cases (12) |
| Known active: `RESET` purpose, SHA-256 at rest, `${FRONTEND_URL}/reset-password?token=…` link | E2E forgot case: stored hash = sha256(raw), 43-char token, 15-minute email |
| Token/email send failures: log + one admin alert, still `204`, no token in alert/log | E2E: token-stage failure, send-stage failure, alert-failure no recursion |
| Policy `12–128` after NFKC, no classes, exact blocklist (`OPEN-1` deviation) | `src/auth/password-policy.spec.ts` (16 tests), `src/auth/password-hasher.spec.ts` |
| Valid `RESET`/`INVITE` link → `200`, credential, tokenVersion+1, sessions revoked, no auto-login | E2E reset cases; `test/db/password-recovery.repository.db-spec.ts` |
| Identical generic `400` for expired/used/unknown/inactive; token not consumed on policy failure | E2E reset cases + concurrency case; DB spec |
| Change: generic `401` wrong current, policy `400`, `200 {user, expiresIn}` + rotated cookie | E2E change cases (4); DB spec change transaction cases |
| Old cookie and second device `401`; new cookie `/auth/me 200`; old password `401`, new `200` | E2E change success case |
| No token/password/hash in responses or logs | E2E asserts bodies, Set-Cookie shape, `Logger.error` silence; alerts/logs checked in failure cases |

Counts below are as of 14 November 2026; T7 expands the e2e matrix and the living tally
lives in `docs/qa/verification-us19.md`. Local commands (from `backend/app`):

```bash
npx vitest run --config ./vitest.config.e2e.ts test/auth-reset.e2e-spec.ts   # 22 passed
npm run test:db                                                              # 42 passed
npm test                                                                     # 150 passed
npm run test:e2e                                                             # 52 passed
npm run lint && npm run build
```

No CI/staging verification is claimed here; `.github/workflows/ci.yml` runs the suites on
push.

## 8. Open items

1. **[OPEN-1]** Scrum Master must amend US19 AC3 to the agreed 12–128 + blocklist
   deviation (or the team formally rejects it — one constant and its boundary tests change).
2. **Rate limiting** for forgot-password (and login) before production.
3. **Token cleanup** job for used/expired `password_reset_tokens` rows (later maintenance).
4. **Frontend**: `/reset-password` page and the `Referrer-Policy: no-referrer` header;
   `/login` remains Member 3's page.
