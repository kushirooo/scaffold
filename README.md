# RAF Consult — Project Management System

Monorepo scaffold for the G10-MARS Sprint 1 build: **NestJS 12 API** (`backend/app`) and **Next.js 16 App Router** (`frontend/app`).

## Sprint 1 status

- **US01 — login, logout, sessions, route guard:** API reconciled to the locked design — httpOnly `mars_at` cookie, `tokenVersion` invalidation, required `X-MARS-CSRF` header, credentialed exact-origin CORS. Contract: [docs/api-contract-us01.md](docs/api-contract-us01.md) (v2). The portal now restores the session once per guarded navigation through a shared `SessionProvider`, which redirects to `/login?next=<pathname+search>` only on a fresh 401; network/5xx failures show a retryable "Could not verify access" state instead. Login honours a validated same-origin `?next` (default `result.redirectTo`/`/dashboard`), and `/` is a public placeholder until the Phase-6 landing shell. The API returns `redirectTo: "/dashboard"` for every role; navbar/logout are on `main`. Evidence: [docs/qa/verification-us01-portal.md](docs/qa/verification-us01-portal.md).
- **US18 / US19:** US18 backend (email module, welcome-email seam, hashed INVITE tokens) and US19 backend (forgot/reset/change-password, 12–128 NFKC policy, bundled blocklist, session and `tokenVersion` invalidation) are implemented and locally verified. Contract: [docs/api-contract-us18-us19.md](docs/api-contract-us18-us19.md); evidence: [docs/qa/verification-us19.md](docs/qa/verification-us19.md). US19 is merged on `main` (PRs #4/#5), including the aligned password-recovery pages.
- **US03 / US04 — projects and assignment:** PM project CRUD (create, list, edit, soft archive/restore) and worker assignment, with notifications and worker dashboard views. Contract: [docs/api-contract-us03-us04.md](docs/api-contract-us03-us04.md); e2e suites: `projects.e2e-spec.ts`, `project-members.e2e-spec.ts`. QA verification is still pending.
- **US02 — user management:** the admin `/users` API (list, create, edit, status, delete; role permissions + e2e) is on `main`. STAB-US02 API now adds the `account.created` welcome-email seam (US18 AC1/AC3), the admin resend route (`POST /users/:id/welcome-email/resend`) and the delete policy (`409 USER_OWNS_PROJECTS` while the user owns projects, archived included). Contract: [docs/api-contract-us02.md](docs/api-contract-us02.md); evidence: [docs/qa/verification-us02.md](docs/qa/verification-us02.md). The `/user-management` route still needs its admin guard/navbar link and the UI alignment pass — tracked in STAB-US02 UI.
- **Integration baseline:** `main` is an integration baseline, not a demoable build yet. US01 login/guards/navbar and the US02 backend/UI are on `main`; US02 still needs its `/user-management` admin guard/navbar link and the UI alignment pass, US18's frontend is not wired, the root route is only a placeholder pending the landing shell (Phase 6), and staging is not deployed.
- **Landing shell:** not started.

## Quick start (API)

```bash
docker compose up -d postgres
cd backend/app
cp .env.example .env      # set a random JWT_SECRET
npm install
npm run db:setup          # migrations + six demo accounts
npm run start:dev
```

Demo password: `SEED_PASSWORD` (default `RafConsult!2026`). Seeded accounts: `admin@`, `pm@`, `worker@`, `viewer@`, `inactive@`, `invited@` — the invited account has no password until it uses an activation/reset link. `RESET_TTL_SECONDS` defaults to 900 (15 minutes).

Local PostgreSQL 18 is exposed on `127.0.0.1:5432` (database `raf_pms`). The Compose volume must mount `/var/lib/postgresql` — PostgreSQL 18+ uses a versioned subdirectory and will not start with the old `/var/lib/postgresql/data` mount.

```bash
npm test          # unit
npm run test:e2e  # API e2e against the dedicated raf_pms_e2e database
npm run test:db   # real PostgreSQL integration (raf_pms_test)
npm run lint
npm run build
```

`npm run test:e2e` expects `raf_pms_e2e`; `npm run test:db` expects `raf_pms_test`. Neither touches `raf_pms`. Create both once:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/raf_pms" -c "create database raf_pms_test;"
psql "postgresql://postgres:postgres@127.0.0.1:5432/raf_pms" -c "create database raf_pms_e2e;"
```

Both test suites migrate and seed their own database; the e2e guard refuses to run against `raf_pms`. CI mirrors this with a PostgreSQL 18 service container (`.github/workflows/ci.yml`).

## Manual API checks (Postman)

Import [docs/http/us01.postman_collection.json](docs/http/us01.postman_collection.json), set the collection variable `password` to the value of `SEED_PASSWORD`, and run the requests top to bottom. Postman stores the httpOnly cookie automatically; the collection tests the cookie flags, CSRF 403, CORS preflight, logout revocation and the old-cookie 401. For the US18/US19 flow (forgot → reset → login → change), use [docs/http/sprint1.http](docs/http/sprint1.http) with a cookie-jar HTTP client and paste the Mailtrap token into the variable.

## Repository layout

```
backend/app/        NestJS API (auth in src/auth, Prisma schema in prisma/)
frontend/app/       Next.js portal + public site
docs/               API contracts, ADRs, QA and team notes
docker-compose.yml  Local PostgreSQL 18
```
