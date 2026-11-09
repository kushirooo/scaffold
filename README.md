# RAF Consult — Project Management System

Monorepo scaffold for the G10-MARS Sprint 1 build: **NestJS 12 API** (`backend/app`) and **Next.js 16 App Router** (`frontend/app`).

## Sprint 1 status

- **US01 — login, logout, JWT sessions, route guard:** implemented and tested. API contract: [docs/api-contract-us01.md](docs/api-contract-us01.md).
- **US18 / US19:** schema and password hashing foundation in place; endpoints not started.
- **Landing shell:** not started.

## Quick start (API)

```bash
docker compose up -d postgres
cd backend/app
cp .env.example .env      # set a random JWT_SECRET
npm install
npm run db:setup          # migrations + four demo accounts
npm run start:dev
```

Demo password: `SEED_PASSWORD` (default `RafConsult!2026`).

```bash
npm test          # unit
npm run test:e2e  # API integration
npm run lint
npm run build
```

## Repository layout

```
backend/app/        NestJS API (auth in src/auth, schema in src/database)
frontend/app/       Next.js portal + public site
docs/               API contracts and sprint notes
docker-compose.yml  Local PostgreSQL
```
