# US01 — Authentication API Contract

**Story:** As a registered user, I want to securely log in with my credentials and log out when finished, so that I can access my project management dashboard and personal data.

**Owner:** Backend (Member 2)
**Status:** Implemented in `backend/app` on 8 Nov 2026
**Consumers:** Member 3 (login UI / route guards), Member 4 (QA), US02 (account creation), US18/US19 (password lifecycle)

---

## 1. Endpoints

Base URL in local development: `http://localhost:4000`.
Authentication is a bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

### `POST /auth/login`

Public. Body validated with `class-validator`; unknown fields are rejected.

```json
{
  "email": "pm@rafconsult.test",
  "password": "RafConsult!2026"
}
```

Success — `200 OK`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": {
    "id": "0f0b6a4e-...",
    "email": "pm@rafconsult.test",
    "fullName": "Faizal Ibrahim",
    "role": "PROJECT_MANAGER"
  },
  "redirectTo": "/dashboard/projects"
}
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

Requires a valid bearer token. Revokes the session that the token belongs to and returns `204 No Content` with no body. The token is rejected immediately afterwards, even though its JWT has not expired.

- `401` if the token is missing, malformed, expired or belongs to an already-revoked session.

### `GET /auth/me`

Requires a valid bearer token. Returns the current principal; useful for restoring the session after a page refresh.

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

- `401` if the token is missing, malformed, expired or its session has been revoked.

---

## 2. Roles and redirect targets

| Role             | `redirectTo`         | Frontend page             |
| ---------------- | -------------------- | ------------------------- |
| `ADMIN`          | `/dashboard`         | Admin overview            |
| `PROJECT_MANAGER`| `/dashboard/projects`| Projects list             |
| `WORKER`         | `/dashboard/tasks`   | My tasks                  |
| `VIEWER`         | `/dashboard/reports` | Reports                   |

The mapping lives in `src/auth/role-dashboard.ts`. **Confirm these paths with the frontend owner** before the integration demo; changing the table changes the API contract.

---

## 3. Session model

- Login creates a row in `sessions` and signs an HS256 JWT with `sub` (user id), `sid` (session id), `role` and `email`.
- TTL is `JWT_TTL_SECONDS` (default 3600 seconds) and is returned as `expiresIn`.
- Every protected request verifies the JWT **and** looks up `sessions.id = sid` with `revoked_at IS NULL AND expires_at > now()`. Logout and deactivation therefore take effect immediately.
- JWT claims are not trusted alone: the role stored on the user row must still match the token claim.
- No refresh token in US01. US20 (session expiry after inactivity) can extend this table rather than replace it.
- Tokens are stateless on the wire but stateful in the database. That is the deliberate trade-off for immediate logout.

### Claim shape

```json
{
  "sub": "0f0b6a4e-...",
  "sid": "9d1f9b7c-...",
  "role": "PROJECT_MANAGER",
  "email": "pm@rafconsult.test",
  "iat": 1794110000,
  "exp": 1794113600,
  "iss": "raf-consult-pms",
  "aud": "raf-consult-portal"
}
```

---

## 4. Security decisions

| Concern | Decision |
| --- | --- |
| Password storage | argon2id, 19 MiB memory, t=2, p=1 (OWASP baseline), in `src/auth/password-hasher.ts` |
| Credential errors | One generic 401; the response never says which field failed, and an unknown email burns a dummy argon2 verify to reduce timing disclosure |
| Inactive accounts | Rejected with the same generic 401 |
| Logout | Session row revoked in PostgreSQL; subsequent requests fail even with a valid JWT |
| JWT algorithm | HS256, fixed on both sign and verify; issuer and audience checked |
| Token exposure | Bearer header only; no cookies, so CSRF is not applicable. The frontend must store the token where XSS cannot read it (memory or an httpOnly proxy) |
| Transport | HTTPS is mandatory outside localhost |
| Rate limiting | **Not implemented.** Add login throttling/lockout before production; it is not an AC for US01 |

---

## 5. Database schema (owned by US01)

Created by migration `001_auth_foundation` in `src/database/migrations.ts`:

- `users` — `id`, `email` (unique case-insensitive), `full_name`, `role`, `is_active`, timestamps
- `credentials` — `user_id`, `password_hash`, `password_updated_at`
- `sessions` — `id`, `user_id`, `created_at`, `expires_at`, `revoked_at`
- `password_reset_tokens` — created now for US19 so there is one owner and one migration history; `US19` adds the endpoints on top.

```sql
users (id uuid pk, email text, full_name text, role text, is_active bool, ...)
credentials (user_id uuid pk fk users, password_hash text, ...)
sessions (id uuid pk, user_id uuid fk users, expires_at timestamptz, revoked_at timestamptz)
password_reset_tokens (id uuid pk, user_id uuid fk users, token_hash text unique, expires_at, used_at)
```

---

## 6. Local setup

```bash
# 1. Start PostgreSQL (repository root)
docker compose up -d postgres

# 2. Configure the API
cd backend/app
cp .env.example .env
# edit JWT_SECRET to a random 32+ character value

# 3. Create the schema and demo users
npm run db:setup

# 4. Run the API
npm run start:dev
```

Seeded accounts share the password in `SEED_PASSWORD` (default `RafConsult!2026`):

| Email | Role |
| --- | --- |
| `admin@rafconsult.test` | `ADMIN` |
| `pm@rafconsult.test` | `PROJECT_MANAGER` |
| `worker@rafconsult.test` | `WORKER` |
| `viewer@rafconsult.test` | `VIEWER` |

`db:seed` refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`.

### Smoke test

```bash
curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"pm@rafconsult.test","password":"RafConsult!2026"}'

curl -s http://localhost:4000/auth/me \
  -H "Authorization: Bearer <accessToken>"

curl -s -X POST http://localhost:4000/auth/logout \
  -H "Authorization: Bearer <accessToken>" -i
```

---

## 7. Environment variables

| Variable | Required | Default (development only) | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | production | `postgresql://postgres:postgres@localhost:5432/raf_pms` | Railway provides this |
| `JWT_SECRET` | production | insecure dev value | 32+ characters, e.g. `openssl rand -base64 48` |
| `JWT_TTL_SECONDS` | no | `3600` | Access-token and session lifetime |
| `PORT` | no | `4000` | |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Comma-separated list allowed |
| `SEED_PASSWORD` | no | `RafConsult!2026` | Demo accounts only |

The API refuses to boot in production with a missing/short `JWT_SECRET` or a missing `DATABASE_URL` (`src/config/env.validation.ts`).

---

## 8. Acceptance criteria → evidence

| AC | Evidence |
| --- | --- |
| 1. Valid credentials grant access and redirect to the role-specific dashboard | `test/auth.e2e-spec.ts` — four role cases; service unit test |
| 2. Invalid credentials show "invalid email or password" without field disclosure | E2E: wrong password, unknown email, deactivated account all return the same 401 body |
| 3. Logout terminates the session and returns to login | E2E: logout `204`, old token gets `401`, session marked revoked; frontend clears token and routes to `/login` |
| 4. Unauthenticated access to protected routes redirects to login | API returns `401` (tested); Member 3's route guard redirects to `/login` on `401` |

Run them with:

```bash
npm test          # unit
npm run test:e2e  # API integration
```

---

## 9. Open items for teammates

1. **Frontend (Member 3):** confirm the four `redirectTo` paths; implement the `/login` form, store the bearer token safely, send `Authorization` on protected calls, and redirect to `/login` on any `401`.
2. **US02 (account creation):** create users through `UsersRepository.create()` so `users` + `credentials` stay consistent, and hash with `PasswordHasher`. Deactivated users are blocked from login automatically.
3. **US18 / US19:** reuse `PasswordHasher`, `sessions` (revoke all sessions after a reset) and the existing `password_reset_tokens` table.
4. **QA:** cover the four AC cases plus deactivated account, expired JWT and revoked token.
5. **Deployment:** `DATABASE_URL` and `JWT_SECRET` must be set on Railway; HTTPS is required.
6. **NIST note for US19:** NIST SP 800-63B Rev 4 requires at least 15 characters for passwords used as a single factor, while US19's agreed floor is 12. The backlog amendment should record that deviation.
