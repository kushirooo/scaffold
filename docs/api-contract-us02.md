# US02 — User management API contract (v1)

**Story:** US02 (administrator user management) · **Owner:** Backend (implementer) · **Version:** v1 (15 November 2026)
**Status:** Implemented in `backend/app` and the portal `/users` UI; local lint/build/e2e/tests green and Lead browser smoke 23/23 (15 Nov 2026). CI and staging checks are pending.
**Consumers:** Portal UI (`/users`; the legacy `/user-management` path 308-redirects here), Member 4 (QA), US18 (welcome email seam)
**References:** [COLLABORATION.md](team/COLLABORATION.md), [US18/US19 contract](api-contract-us18-us19.md), [`account.created` seam](us02-seam.md), [US01 contract](api-contract-us01.md)

US02 reuses the US01 cookie transport, CSRF rule, session model and error style. Every
endpoint below requires the `mars_at` cookie **and** the admin permission `users:manage`;
every non-GET also requires `X-MARS-CSRF: 1`. Missing/invalid session → `401`
(`Authentication required` / `Invalid or expired access token` / `Session is no longer
valid`); non-admin session → `403 { "message": "Administrator access required." }`;
missing/wrong CSRF → `403 { "message": "Missing or invalid CSRF header" }`.

Request bodies are validated with `class-validator` (`whitelist: true,
forbidNonWhitelisted: true`): unknown fields → `400` with a `message` array.

## 1. Response field mapping (DB → API)

The API shape is now stable; the UI's field names are not renamed here.

| API field | Source | Notes |
| --- | --- | --- |
| `id` | `users.id` | UUID |
| `name` | `users.full_name` | `fullName` at the DB layer only |
| `email` | `users.email` | Unique; normalised to lower case on create/update |
| `position` | `users.position` | 1–100 characters |
| `yearsOfExperience` | `users.years_of_experience` | Integer 0–60 |
| `role` | `users.role` | Label, not enum: `ADMIN`→`Admin`, `PROJECT_MANAGER`→`Project Manager`, `WORKER`→`Worker`, `VIEWER`→`Viewer` |
| `status` | `users.is_active` | `true`→`Active`, `false`→`Inactive` |
| `joinedAt` | `users.created_at` | ISO timestamp |
| `lastActiveAt` | latest `sessions.created_at` | ISO timestamp or `null` when the user never signed in |

Credentials, password hashes, session ids and reset/invite tokens are never returned.

## 2. Endpoints

### `GET /users`

Admin only. `200 OK`:

```json
{ "users": [ { "id": "…", "name": "Faizal Ibrahim", "email": "pm@rafconsult.test",
  "position": "Project Manager", "yearsOfExperience": 8, "role": "Project Manager",
  "status": "Active", "joinedAt": "2026-11-01T00:00:00.000Z", "lastActiveAt": null } ] }
```

Ordered by `created_at` descending (id ascending as tie-break).

### `GET /users/roles`

Admin only. `200 OK` — the server-provided permission matrix. The shipped `/users` dashboard
renders its role list and permission table statically (`SYSTEM_ROLES`/`PERMISSIONS`) and does not
fetch this endpoint; it exists for consumers that need the matrix from the API (e.g. a future
role editor).

```json
{ "roles": [ { "role": "Admin", "permissions": ["projects:view", "users:manage", "roles:change", "…"] } ] }
```

### `POST /users`

Admin only; CSRF required. `201 Created` with `{ "user": <mapped user> }`.

```json
{ "name": "Aisyah Rahman", "email": "aisyah@rafconsult.test", "password": "a long passphrase",
  "position": "Engineer", "yearsOfExperience": 4, "role": "Worker" }
```

- `name` 2–120 (trimmed), `email` valid + max 254 (trimmed, lower-cased),
  `password` 12–1024, `position` 1–100 (trimmed), `yearsOfExperience` integer 0–60,
  `role` one of the four labels above (enum strings are also accepted).
- Validation failure → `400` with the validation `message` array.
- Duplicate email → `409 { "code": "DUPLICATE_EMAIL", "message": "This email address is already registered." }`.
- After the row (and its credential) commits, the service emits `account.created` —
  see §3. The response is never failed by the welcome email.

### `PATCH /users/:id`

Admin only; CSRF required. `200 OK` with `{ "user": <mapped user> }`. All body fields are
optional: `name`, `email`, `position`, `yearsOfExperience`, `role` (same validation as create).

- `400` invalid UUID / validation.
- `404 { "code": "USER_NOT_FOUND", "message": "User not found." }`.
- `403 "You cannot remove your own administrator role."` when an admin demotes themselves.
- `409 "The last active administrator cannot be removed."` when demoting the last active admin.
- `409 DUPLICATE_EMAIL` as above.
- An email or role change bumps `users.token_version` and revokes all of the user's sessions
  (the old cookie is rejected on the next request; the user signs in again).

### `PATCH /users/:id/status`

Admin only; CSRF required. Body: `{ "status": "active" | "inactive" }` (case-insensitive).
`200 OK` with `{ "user": <mapped user> }`; a no-op when the status already matches.

- `400` invalid UUID or a `status` value outside `active`/`inactive`.
- `404 { "code": "USER_NOT_FOUND", "message": "User not found." }`.
- `403 "You cannot deactivate your own account."`.
- `409 "The last active administrator cannot be removed."`.
- Deactivation bumps `token_version` and revokes all sessions; an inactive user cannot log in.

### `POST /users/:id/welcome-email/resend`

Admin only; CSRF required. No request body. Calls the US18 handler directly, so the result
is deterministic. `200 OK`:

```json
{ "status": "sent" }
```

- `400` invalid UUID (`ParseUUIDPipe`) —
  `{ "message": "Validation failed (uuid is expected)", "error": "Bad Request", "statusCode": 400 }`.
- `404 { "code": "USER_NOT_FOUND", "message": "User not found." }` — unknown id.
- `409 { "code": "USER_INACTIVE", "message": "This account is inactive. Reactivate it before resending the welcome email." }`
  — an INVITE link cannot activate a deactivated account, so nothing is sent.
- `502 { "code": "WELCOME_EMAIL_FAILED", "message": "The welcome email could not be sent. The previous activation link is no longer valid; retry the resend.", "stage": "token" | "send" }`
  — the handler returned `{ status: "failed" }`; `stage` is where it failed. `issueInvite`
  commits before the send, so on `stage: "send"` any previous unused INVITE row is already
  used-marked and the replacement was never delivered: the old link no longer works, and the
  admin should retry the resend (a retry issues and delivers a fresh link).
- Re-issuing marks the user's previous unused `INVITE` token used and inserts a new one
  (at most one activation link stays valid). A new welcome email is sent on every success.

### `DELETE /users/:id`

Admin only; CSRF required. `204 No Content`, no body.

- `400` invalid UUID (`ParseUUIDPipe`).
- `403 "You cannot delete your own account."`.
- `409 "The last active administrator cannot be removed."`.
- `409 { "code": "USER_OWNS_PROJECTS", "message": "This user owns projects. Reassign or remove those projects before deleting the account." }`
  — **delete policy:** `project.owner` has `onDelete: Cascade`, so deleting an owner would
  silently destroy their projects. Deletion refuses while the user owns **any** project,
  archived ones included, using one conditional statement
  (`user.deleteMany({ where: { id, ownedProjects: { none: {} } } })`), so a project created
  concurrently cannot slip past a separate count. Reassign or remove the projects first; a
  subsequent delete of the project-free user returns `204`.
- `404 { "code": "USER_NOT_FOUND", "message": "User not found." }` as above.

## 3. Welcome-email seam (US18 AC1/AC3)

- `POST /users` emits `ACCOUNT_CREATED` (`account.created`) from
  [`account-events.ts`](../backend/app/src/accounts/account-events.ts) **after** the create
  has committed — never inside a transaction — with
  `{ userId, email, fullName, role, occurredAt: new Date(), correlationId: randomUUID() }`.
- US02 imports only the event constant, the payload type and the handler service; it never
  imports `EmailModule` or a transport adapter.
- `WelcomeEmailListener` runs the handler asynchronously (`{ async: true }`), so a slow or
  failing email cannot delay or fail the `201`. The handler never throws, logs one structured
  failure and attempts one admin alert (US18 owns that wording).
- No raw token, token hash, password or email body appears in any `/users` response or log.
- Re-emitting per account is avoided: one create = one email. `POST …/resend` is the only
  deliberate second send, and it is an explicit admin action.

## 4. UI consumption (STAB-US02 UI)

The admin portal consumes this contract at `/users` (client code:
`frontend/app/lib/users-api.ts`, mapping/error helpers `frontend/app/lib/user-admin.ts`,
unit tests `frontend/app/lib/user-admin.test.mjs`).

- **Route and access:** `/users` renders `SessionProvider → AuthGuard → AdminGuard`; a
  non-admin session sees an "Access Denied" page (US02 AC5), and the navbar shows the Users
  link only to `ADMIN`. The old `/user-management` route permanently redirects (HTTP 308) to
  `/users`; no old links break.
- **Header:** the app navbar shows the real session user (`fullName` + role label), never a
  hardcoded administrator. The page body echoes the same session user beside the actions.
- **List:** every §1 field is rendered (`name`, `email`, `position`, `yearsOfExperience`,
  role label, `status`, `joinedAt`, `lastActiveAt`, with `Never` for `null`); search, role /
  position / status filters, pagination, table and card views are client-side over one
  `GET /users` response. The `PATCH` responses omit the sessions include, so edit/status merge
  the response over the existing row (`mergeUserRecord`) and keep the displayed
  `lastActiveAt` until the next full list reload.
- **Create:** `POST /users`; on `201` the list is updated and the success toast says the
  welcome email with the activation link is sent **asynchronously** — it may take a moment,
  and Resend is the recovery action if it does not arrive. `409 DUPLICATE_EMAIL` stays an
  inline email field error; no generic toast.
- **Resend:** per-row (and resend-on-success-toast) `POST /users/:id/welcome-email/resend`.
  `200` → success toast. `502 WELCOME_EMAIL_FAILED` → error toast with the API message and a
  Retry action (retrying issues a fresh link; the previous one is already invalid). `409
  USER_INACTIVE` → error toast. `401`/`403` are left to the session/guard; the dashboard
  (`user-management-dashboard.tsx` `redirectToLogin`) sends a `401` to `/login?next=/users`.
- **Delete:** `409 USER_OWNS_PROJECTS` surfaces the API message verbatim in an error toast
  ("Cannot delete this user.") and the row stays; success removes the row.
- The UI never sends `profilePicture`/FormData (the API has no upload endpoint), has no demo
  mode (`NEXT_PUBLIC_DEMO_MODE` removed), and never stores a token: auth remains cookie-only.

## 5. Known gaps

- No rate limiting on `POST /users/:id/welcome-email/resend`; an admin could email-bomb a
  user's address. Same US01/US19 station as login/forgot-password throttling.
- `POST /users` still requires a password (the schema supports invited accounts without one,
  but that flow is not exposed yet).
- An admin who wants to delete a user owning projects must reassign/remove those projects in
  the project UI first; `/users` surfaces the policy but does not link to the project list.
- Profile pictures and invited-account creation are not exposed anywhere; the UI no longer
  shows an upload control for an endpoint that does not exist.
