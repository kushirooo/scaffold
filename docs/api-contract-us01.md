# US01 — Authentication API Contract (v2)

**Story:** As a registered user, I want to securely log in with my credentials and log out when finished, so that I can access my project management dashboard and personal data.

**Owner:** Backend (Member 2) · **Version:** v2 (cookie transport, 9 Nov 2026)
**Status:** Implemented in `backend/app` against the locked design (§7 of the sprint plan)
**Consumers:** Member 3 (login UI / route guards), Member 4 (QA), US02 (account creation), US18/US19 (password lifecycle)

> **v2 breaking change.** v1 returned the access token in the response body. v2 has **no token in any response body**. The signed JWT is delivered only in the httpOnly `mars_at` cookie, every browser call must use `credentials: "include"`, and every non-GET request must send `X-MARS-CSRF: 1`. There is no header-auth fallback.

---

## 1. Endpoints

Base URL in local development: `http://localhost:4000`.
Authentication is the httpOnly `mars_at` cookie set by `POST /auth/login`.

### `POST /auth/login`

Public. **Requires `X-MARS-CSRF: 1`.** Body validated with `class-validator`; unknown fields are rejected.

```json
{
  "email": "pm@rafconsult.test",
  "password": "RafConsult!2026"
}
```

Success — `200 OK`. **The body contains no token.** The access token is in `Set-Cookie`:

```json
{
  "user": {
    "id": "0f0b6a4e-...",
    "email": "pm@rafconsult.test",
    "fullName": "Faizal Ibrahim",
    "role": "PROJECT_MANAGER"
  },
  "redirectTo": "/dashboard",
  "expiresIn": 3600
}
```

`Set-Cookie` (development; staging adds `Secure` and `SameSite=None`). Express derives `Expires` from `Max-Age` at response time:

```
mars_at=<JWT>; Max-Age=3600; Path=/; Expires=<now + 3600 s, e.g. Mon, 09 Nov 2026 06:23:54 GMT>; HttpOnly; SameSite=Lax
```

Failure — `401 Unauthorized` for an unknown email, a wrong password or a deactivated account. The response is deliberately identical in all three cases:

```json
{
  "message": "Invalid email or password",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Malformed or missing fields — `400 Bad Request`:

```json
{
  "message": ["email must be an email"],
  "error": "Bad Request",
  "statusCode": 400
}
```

### `POST /auth/logout`

Requires the `mars_at` cookie and **`X-MARS-CSRF: 1`**. Revokes the session row and clears the cookie, returning `204 No Content` with no body. The cookie is rejected immediately afterwards, even though its JWT has not expired.

- `401` if the cookie is missing, malformed, expired or belongs to an already-revoked session.
- `403` if the CSRF header is missing or wrong.

### `GET /auth/me`

Requires the `mars_at` cookie (GET needs no CSRF header). Returns the current principal; useful for restoring the session after a page refresh.

```json
{
  "user": {
    "id": "0f0b6a4e-...",
    "email": "pm@rafconsult.test",
    "fullName": "Faizal Ibrahim",
    "role": "PROJECT_MANAGER"
  }
}
```

- `401` if the cookie is missing, malformed, expired, its session has been revoked, the account is inactive, or the token's `tv` no longer matches `users.token_version`.

### `GET /health`

Public, no CSRF header needed (GET). Used by Railway/Vercel healthchecks.

`200 OK`:

```json
{ "status": "ok", "db": "up" }
```

`503 Service Unavailable` when the database check fails:

```json
{ "status": "error", "db": "down" }
```

---

## 2. Redirect target (D1)

Sprint 1 ships a single portal dashboard route, so **every role gets `redirectTo: "/dashboard"`**. The role is still returned in `user.role`; the frontend branches on it for content, not for the route.

| Role | `redirectTo` | `user.role` |
| --- | --- | --- |
| `ADMIN` | `/dashboard` | `ADMIN` |
| `PROJECT_MANAGER` | `/dashboard` | `PROJECT_MANAGER` |
| `WORKER` | `/dashboard` | `WORKER` |
| `VIEWER` | `/dashboard` | `VIEWER` |

The mapping lives in `src/auth/role-dashboard.ts` (`DASHBOARD_PATH`).

---

## 3. Cookie contract

| Cookie | Flags (development) | Flags (staging/production) |
| --- | --- | --- |
| `mars_at` | `HttpOnly`, `Path=/`, `Max-Age=JWT_TTL_SECONDS`, `SameSite=Lax`, no `Secure` | adds `Secure`, `SameSite=None` |

- Only one auth cookie; no non-httpOnly token, no token in `localStorage`.
- `COOKIE_SECURE` and `COOKIE_SAMESITE` come from validated env. The API refuses to boot when `SameSite=None` is combined with an insecure cookie, or when production runs with `COOKIE_SECURE=false`.
- `app.set('trust proxy', 1)` so TLS-terminating proxies do not confuse secure-cookie handling.

---

## 4. CSRF

- Global guard: safe methods (`GET`, `HEAD`, `OPTIONS`) pass.
- **Every** other method requires `X-MARS-CSRF: 1`. Missing or wrong → `403`:

```json
{ "message": "Missing or invalid CSRF header", "error": "Forbidden", "statusCode": 403 }
```

- There is no CSRF cookie and no exemption: login, logout and all future mutations require the header.
- Value is not a secret. Browsers cannot set custom headers on form posts; a cross-origin `fetch` with one triggers a preflight that the exact-origin CORS policy rejects.

---

## 5. CORS

- `CORS_ORIGIN` is a comma-separated list of exact origins; credentials are enabled.
- Allowed request headers: `Content-Type`, `X-MARS-CSRF`; methods `GET, POST, PATCH, PUT, DELETE, OPTIONS`; preflight cache `600 s`.
- Boot validation rejects a wildcard (`*`), a non-HTTPS origin that is not localhost, an origin with a path, and an empty list.
- Disallowed origins receive **no** `Access-Control-Allow-Origin`; the browser blocks the response.
- Local: `http://localhost:3000`. Staging: the exact Vercel production domain. Preview deployments are not allowlisted.

---

## 6. Session and token model

- Login creates a row in `sessions` and signs an HS256 JWT placed in `mars_at`.
- Claims: `sub` (user id), `sid` (session id), `tv` (token version), `role`, `email`, plus fixed `iss`, `aud`, `exp = now + JWT_TTL_SECONDS`.
- TTL is `JWT_TTL_SECONDS` (default 3600) and returned as `expiresIn`.
- Every protected request:
  1. reads `mars_at`;
  2. verifies the JWT (fixed algorithm, issuer, audience);
  3. loads `sessions.id = sid`, requires `revoked_at IS NULL` and requires `expires_at` to be in the future compared against the **API server's clock** (the same clock that produced `expiresIn`), and checks it belongs to `sub`;
  4. loads `users.id = sub`, checks `is_active = true`, the role still matches, and **`users.token_version === tv`**.
- A missing/invalid token returns `401 { "message": "Authentication required" }` or `401 { "message": "Invalid or expired access token" }`. Revocation, deactivation, role changes and `tv` mismatch return `401 { "message": "Session is no longer valid" }`.
- No refresh token in US01. Sessions are stateless on the wire but stateful in PostgreSQL: the deliberate trade-off for immediate logout.

### Invalidation matrix

| Event | Mechanism | Effect |
| --- | --- | --- |
| Logout | `sessions.revoked_at = now()`, cookie cleared | That device only |
| Password change (US19) | `token_version += 1`, revoke all sessions, new session + cookie | Other devices out; current device stays in |
| Password reset (US19) | `token_version += 1`, revoke all sessions, no auto-login | All devices out |
| Account deactivated (US02) | `is_active = false` | All requests 401 on next call |
| Role changed | Guard compares DB role to claim | Old token 401; user re-logs in |

---

## 7. Security decisions

| Concern | Decision |
| --- | --- |
| Password storage | argon2id, 19 MiB memory, t=2, p=1 (OWASP baseline), in `src/auth/password-hasher.ts` |
| Credential errors | One generic 401; an unknown email burns a dummy argon2 verify to reduce timing disclosure |
| Inactive accounts | Rejected with the same generic 401 |
| Transport | httpOnly cookie only; no token in bodies or storage; no header fallback |
| CSRF | Mandatory `X-MARS-CSRF: 1` on every non-GET request, combined with exact-origin credentialed CORS and `SameSite` |
| Logout | Session row revoked in PostgreSQL; subsequent requests fail even with an unexpired JWT |
| Global invalidation | `users.token_version` compared with the `tv` claim on every request |
| JWT algorithm | HS256, fixed on both sign and verify; issuer and audience checked |
| HTTPS | Mandatory outside localhost; production requires a secure cookie |
| Rate limiting | **Not implemented.** Add login throttling/lockout before production; not an AC for US01 |

---

## 8. Database schema (Prisma baseline)

Schema: `backend/app/prisma/schema.prisma`; baseline migration: `prisma/migrations/20261109041339_init_auth_schema/migration.sql`.

- `users` — `id` uuid PK, `email` unique (stored lowercase), `full_name`, `role` enum, `is_active`, `token_version` integer default 0, timestamps (`timestamptz`)
- `credentials` — `user_id` PK/FK, nullable `password_hash` and `password_updated_at` (US02 creates the account before a password)
- `sessions` — `id` uuid PK, `user_id` FK (cascade), `created_at`, `expires_at`, nullable `revoked_at`; indexes on `user_id`, `expires_at`
- `password_reset_tokens` — created for US18/US19; `token_hash` unique, `purpose` enum (`INVITE`/`RESET`), `expires_at`, nullable `used_at`
- Enums: `UserRole` (`ADMIN`, `PROJECT_MANAGER`, `WORKER`, `VIEWER`), `ResetTokenPurpose` (`INVITE`, `RESET`)

The pre-sprint `src/database` migration runner no longer exists; Prisma Migrate owns the schema.

---

## 9. Local setup

```bash
# 1. Start PostgreSQL (repository root)
docker compose up -d postgres

# 2. Configure the API
cd backend/app
cp .env.example .env
# edit JWT_SECRET to a random 32+ character value

# 3. Apply the schema and seed the demo users
npm run db:setup

# 4. Run the API
npm run start:dev
```

Seeded accounts share the password in `SEED_PASSWORD` (12+ characters):

| Email | Role | State |
| --- | --- | --- |
| `admin@rafconsult.test` | `ADMIN` | active |
| `pm@rafconsult.test` | `PROJECT_MANAGER` | active |
| `worker@rafconsult.test` | `WORKER` | active |
| `viewer@rafconsult.test` | `VIEWER` | active |
| `inactive@rafconsult.test` | `WORKER` | inactive (401 test) |
| `invited@rafconsult.test` | `WORKER` | no password (activation flow) |

`db:seed` refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`.

### Smoke test (cookie jar)

```bash
COOKIE_JAR=$(mktemp)
curl -s -c "$COOKIE_JAR" -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-MARS-CSRF: 1' \
  -d '{"email":"pm@rafconsult.test","password":"<SEED_PASSWORD>"}'

curl -s -b "$COOKIE_JAR" http://localhost:4000/auth/me

curl -s -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST http://localhost:4000/auth/logout \
  -H 'X-MARS-CSRF: 1'

# CSRF gate: must return 403
curl -s -i -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"pm@rafconsult.test","password":"<SEED_PASSWORD>"}'
```

---

## 10. Environment variables

| Variable | Required | Default (development only) | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | production | `postgresql://postgres:postgres@localhost:5432/raf_pms` | Railway provides this |
| `JWT_SECRET` | production | insecure dev value | 32+ characters, e.g. `openssl rand -base64 48` |
| `JWT_TTL_SECONDS` | no | `3600` | Access-token and session lifetime |
| `PORT` | no | `4000` | |
| `CORS_ORIGIN` | production | `http://localhost:3000` | Exact origins, comma-separated; no `*` |
| `COOKIE_SECURE` | no | `false` (dev), `true` (prod) | Must be `true` in production |
| `COOKIE_SAMESITE` | no | `lax` | `lax`, `strict` or `none`; `none` requires `COOKIE_SECURE=true` |
| `FRONTEND_URL` | production | `http://localhost:3000` | Absolute origin used for email links |
| `TEST_DATABASE_URL` | no | `.../raf_pms_test` | Dedicated DB for `npm run test:db` |
| `E2E_DATABASE_URL` | no | `.../raf_pms_e2e` | Dedicated DB for `npm run test:e2e`; the suite migrates/seeds it and refuses `raf_pms` |
| `SEED_PASSWORD` | no | `RafConsult!2026` | Demo accounts only |
| `ALLOW_DEMO_SEED` | no | unset | `true` lets `db:seed` run when `NODE_ENV=production`; never set in production |

The API refuses to boot when a production-only value is missing, `JWT_SECRET` is too short, the CORS list is wildcard/insecure, or the cookie configuration is unsafe.

---

## 11. Acceptance criteria → evidence

| AC | Evidence |
| --- | --- |
| 1. Valid credentials grant access and redirect to the dashboard | `test/auth.e2e-spec.ts` — four role cases, `redirectTo: /dashboard`; `src/auth/auth.service.spec.ts` |
| 2. Invalid credentials show "invalid email or password" without field disclosure | E2E: wrong password, unknown email, inactive account all return the same 401 body |
| 3. Logout terminates the session and returns to login | E2E: logout `204` + cleared cookie, old cookie gets `401`, session revoked; frontend routes to `/login` |
| 4. Unauthenticated access to protected routes redirects to login | API returns `401`; Member 3's route guard redirects to `/login` on `401` |
| 5. No token in the response body / cookie is httpOnly | E2E asserts body shape and `Set-Cookie` flags |
| 6. CSRF required on non-GET | E2E: missing/wrong header → `403` |
| 7. `tv` mismatch invalidates tokens | E2E: DB `token_version` bump → old cookie `401`; unit test for `resolveSession` |
| 8. CORS is credentialed and exact-origin | E2E: allowed origin echoes + `Access-Control-Allow-Credentials: true`; disallowed origin gets no ACAO |
| 9. Health reports DB readiness | `test/health.e2e-spec.ts` (200 up), `src/health/health.controller.spec.ts` (503 down) |

Run them with:

```bash
npm test          # unit
npm run test:e2e  # API integration against the dedicated e2e database
npm run test:db   # repository + seed integration against raf_pms_test
```

`test:e2e` targets `E2E_DATABASE_URL` (default `postgresql://postgres:postgres@127.0.0.1:5432/raf_pms_e2e`). Its global setup refuses a URL naming `raf_pms`, applies the Prisma migrations, seeds the six demo accounts with a fixed e2e password, and points every test worker at that database. **CI prerequisite:** provide a `raf_pms_e2e` database in the Postgres service container (or set `E2E_DATABASE_URL`) before running the e2e job; the setup fails with an actionable message if the database does not exist.

---

## 12. Open items for teammates

1. **Frontend (Member 3):** implement the `/login` form with `fetch(..., { credentials: 'include' })`, send `X-MARS-CSRF: 1` on every non-GET request, never read or store the token, and route to `/dashboard` on any `401`.
2. **US02 (account creation):** create users through `UsersRepository.create()` so `users` + `credentials` stay consistent, and hash with `PasswordHasher`. Deactivated users are blocked from login automatically. **Invited accounts (D4):** `CreateUserInput.passwordHash` is currently required, so `create()` cannot yet create a user without a password. US02 must first make it optional (or add a dedicated invited-user method); the schema already supports it (`Credential?`, nullable `password_hash`) and login treats a missing/null hash as the generic 401.
3. **US18 / US19:** reuse `PasswordHasher`, the `sessions` table (revoke all after a reset) and `password_reset_tokens`; bump `token_version` for global invalidation. Email links use `FRONTEND_URL`.
4. **QA:** cover the four AC cases plus deactivated account, expired JWT, revoked cookie, CSRF failure, CORS rejection and `tv` mismatch.
5. **Deployment:** set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL`, `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none` on Railway; HTTPS is required.
6. **NIST note for US19:** NIST SP 800-63B Rev 4 requires at least 15 characters for passwords used as a single factor, while US19's agreed floor is 12. The backlog amendment should record that deviation.
