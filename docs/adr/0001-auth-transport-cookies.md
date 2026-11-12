# ADR 0001 — Authentication transport: httpOnly cookies, versioned sessions, CSRF header

| Field | Value |
|---|---|
| Status | Accepted — design decided; implementation in Phase 2 (US01) |
| Date | 9 November 2026 |
| Decisions | D2, D5 (related: D1, D9) |
| Supersedes | Bearer-token transport in `docs/api-contract-us01.md` (v1) |
| Plan references | `SPRINT1_PLAN.md` §1.2, §5, §6, §7.1–§7.7, §12, §14.2, §20 R4 |
| Related | ADR 0002 (schema), [decision log](README.md) |

## Context

The preserved baseline (tag `pre-reconcile`) implements US01 with Bearer tokens in the response
body, a `sessions` table and raw `pg`; its contract argues "no cookies, so CSRF is not
applicable" (`docs/api-contract-us01.md` §4). The locked stack requires httpOnly cookies, a
`tokenVersion` compared by the guard, and Prisma (`SPRINT1_PLAN.md` §1.2). On 8 November the
human sponsor chose **full reconciliation** over keeping both paths. Three properties must
hold: the browser cannot read the token; logout kills one device immediately; a password
change or reset kills every device. A stateless JWT satisfies none, and the session table
alone cannot separate "this device logged out" from "invalidate everything".

## Decision

1. **Transport.** HS256 JWT only in the `mars_at` cookie (`HttpOnly`, `Path=/`, `Secure`
   in staging/production, `SameSite=lax` in development, `SameSite=none` in staging —
   cross-site Vercel → Railway). Login returns `{ user, redirectTo, expiresIn }` with no
   token in the body and no `localStorage`; the frontend sends `credentials: 'include'`
   (§7.2, §12).
2. **Claims and guard.** Claims: `sub`, `sid`, `tv`, `role`, `email`, `iss`, `aud`, `exp`;
   algorithm, issuer and audience fixed on verify. Each protected request re-checks the
   session (exists, not revoked, not expired, belongs to `sub`), the user (exists, active,
   role unchanged) and `users.token_version === tv` (§7.3).
3. **Invalidation split (D2).** Logout sets `sessions.revoked_at` — that device only.
   Password change and reset bump `token_version` and revoke all sessions — every device.
   Change-password issues a new session for the current device; reset does not auto-login
   (D10). `tokenVersion` is monotonic, never reused, and the only global mechanism; there
   is no refresh token in Sprint 1 (US20 deferred).
4. **CSRF (D5).** A global `CsrfGuard` runs before auth: safe methods pass; every other
   method requires `X-MARS-CSRF: 1`, including login, forgot-password and reset-password.
   Missing/wrong → `403 {"message":"Missing or invalid CSRF header"}`. No CSRF cookie: the
   header is not a secret, but HTML forms cannot set it and a cross-origin `fetch` with it
   preflights against exact-origin CORS (§7.4).
5. **CORS.** Exact origins from `CORS_ORIGIN`, `credentials: true`, headers
   `Content-Type` and `X-MARS-CSRF`. Wildcards, non-HTTPS origins other than `localhost`,
   and `sameSite=none` without `secure` are rejected at boot; `trust proxy` is set for
   Railway TLS termination (§7.5).
6. **Known gap (D9).** No login throttling, lockout or forgot-password rate limit in
   Sprint 1 — recorded, not hidden (§7.9).

## Consequences

- **Positive.** Scripts cannot read the token; logout is immediate; a reset or password
  change kills every device; one exact-origin CORS policy replaces two trust models.
- **Negative cost.** CSRF becomes applicable — the opposite of the v1 contract. Staging
  cookies are cross-site, which is why `Secure` + `SameSite=None` + the header are
  mandatory and Safari/ITP is tracked (R4), with a Next.js rewrite proxy as fallback only
  after debugging CORS/SameSite. A `localStorage` fallback is forbidden (§12).
- **Downstream work.** The contract is rewritten to v2 on Day 2; Member 3 uses
  `credentials: 'include'` and stores no token. `redirectTo` is `/dashboard` for all roles
  (D1). Tests cover `Set-Cookie` flags, missing/junk cookie 401s, CSRF 403, CORS preflight,
  and boot rejection of `CORS_ORIGIN=*` and `SameSite=None` without `Secure`.
- **Out of scope here.** Token TTL policy, session-expiry UX and throttling; US20 extends
  the session table rather than replacing it.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep the Bearer baseline | Locked design and sponsor decision require cookies; no XSS-resistant storage story |
| Bearer + cookie simultaneously | Two auth paths, double CSRF surface, two guard trust models (§1.2) |
| httpOnly cookie, no session table | Logout could not take effect before JWT expiry |
| Session table only (revoke all for logout) | Cannot distinguish per-device logout; one browser would sign out every device |
| Double-submit CSRF token | Correct but needs a second cookie, rotation and secret handling; header + CORS is the agreed minimal defence, double-submit is the upgrade path |
| `Origin`/`Referer` validation instead of a header | Weaker, may be stripped by proxies, does not force a preflight |
| `SameSite=Lax` everywhere | Staging frontend and API are different registrable domains; the cookie would not be sent |
