# RAF Consult — Project Management System

Monorepo scaffold for the G10-MARS Sprint 1 build: **NestJS 12 API** (`backend/app`) and **Next.js 16 App Router** (`frontend/app`).

## Sprint 1 status

- **US01 — login, logout, JWT sessions, route guard:** baseline implemented on Bearer tokens and now backed by Prisma. Phase 2 reconciles it to httpOnly cookies + CSRF. Contract: [docs/api-contract-us01.md](docs/api-contract-us01.md) (v1 Bearer; v2 pending Phase 2).
- **US18 / US19:** schema and password-hashing foundation in place; email and reset endpoints not started.
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

Demo password: `SEED_PASSWORD` (default `RafConsult!2026`). Seeded accounts: `admin@`, `pm@`, `worker@`, `viewer@`, `inactive@`, `invited@` — the invited account has no password until the activation flow lands.

Local PostgreSQL 18 is exposed on `127.0.0.1:5432` (database `raf_pms`). The Compose volume must mount `/var/lib/postgresql` — PostgreSQL 18+ uses a versioned subdirectory and will not start with the old `/var/lib/postgresql/data` mount.

```bash
npm test          # unit
npm run test:e2e  # API integration (in-memory repositories)
npm run test:db   # real PostgreSQL integration (raf_pms_test)
npm run lint
npm run build
```

`npm run test:db` expects a separate `raf_pms_test` database. Create it once:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/raf_pms" -c "create database raf_pms_test;"
```

## Repository layout

```
backend/app/        NestJS API (auth in src/auth, Prisma schema in prisma/)
frontend/app/       Next.js portal + public site
docs/               API contracts, ADRs, QA and team notes
docker-compose.yml  Local PostgreSQL 18
```
