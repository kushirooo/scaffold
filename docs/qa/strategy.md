# QA Strategy — MARS Sprint 1

| Field | Value |
|---|---|
| Owner | `qa-engineer` |
| Applies to | US01, US18, US19, landing shell, and the supporting Prisma/CI/staging work |
| Sprint window | 9–18 Nov 2026 |
| Plan | `/home/anoshizuku/Projects/SPRINT1_PLAN.md` §14–§16 |
| Backlog | `/home/anoshizuku/Projects/Product_Backlog.md` §4.1, §7.6 |
| Operating contract | [`../team/COLLABORATION.md`](../team/COLLABORATION.md) |
| Last updated | 9 Nov 2026 (T3) |

This document defines how quality is made verifiable **before** implementation lands. It does not change scope: the sprint plan and product backlog define what is built; this document defines how we know it is built correctly, what evidence is required, and which checks cannot run in the agent sandbox.

Companion documents: [AC matrix](ac-matrix.md) · [defect workflow](defect-workflow.md) · [evidence template](evidence-template.md) · [staging smoke script](../../scripts/smoke-staging.sh).

---

## 1. QA principles

1. **Evidence over adjectives.** A check is a command, a result, and a reproducible artifact — not "works".
2. **Defer, do not fake.** A check that cannot run is labelled `DEFERRED (<reason>)` with an owner and the environment where it will run. Never write "passed" for a check that did not execute ([COLLABORATION §8](../team/COLLABORATION.md)).
3. **Test at the cheapest layer that proves the AC.** Pure logic (policy, hashing, role map) is unit-tested; transport/cookies/CSRF/DB state is e2e; deploy correctness is staging; human-perceived quality (deliverability, a11y, responsive) is manual.
4. **Independent verification.** The implementer self-checks, then QA reruns the acceptance checks from the task description. QA does not trust the implementation report and does not edit source.
5. **One owner per artifact.** Coders fix code; QA verifies; the Lead adjudicates and owns Git.
6. **Secrets never enter fixtures, evidence, logs, or the repository.** Test accounts use the seeded dev password from `SEED_PASSWORD`; staging smoke credentials come from environment variables at run time.
7. **Every AC has a row.** The [AC matrix](ac-matrix.md) is the single status surface. A row changes status only when the evidence it names exists.
8. **The plan wins.** If a check contradicts the plan or an ADR, the Lead adjudicates; QA records the discrepancy, it does not silently pick a winner.

---

## 2. Test layers

| Layer | Tool | What it proves | Where it runs | Entry criteria |
|---|---|---|---|---|
| **Unit** | Vitest (`npm test`, `scaffold/backend/app`) | Password policy, argon2 parameters, reset-token issue/consume logic, email template rendering/escaping, guards (mocked), role → `redirectTo` mapping | Agent sandbox and CI | Dependencies present; no database needed |
| **Integration / e2e** | Vitest + supertest + real Postgres (`npm run test:e2e`), email `memory` transport | HTTP status/body, `Set-Cookie` flags, cookie auth, CSRF 403, CORS, DB state (session revocation, `token_version`, token rows), memory inbox contents | **CI and staging only** — `DEFERRED (no DB)` locally | Postgres service up; migrations deployed; `resetDatabase()` between specs (plan §14.3) |
| **Staging smoke** | `scaffold/scripts/smoke-staging.sh` (curl + cookie jar); browser | Deployed `/health`, cookie login, `/auth/me`, CSRF rejection, logout/revocation; DoD validation | Staging (Railway API; Vercel frontend) | Staging deployed; a seeded account exists; `BASE_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD` supplied at run time |
| **Manual** | Chrome/Firefox DevTools, Mailtrap, Resend, Lighthouse, axe DevTools, screen sizes | Email deliverability and content, cookie behaviour in a real browser, landing responsiveness and WCAG 2.2 AA, Lighthouse targets | Developer/staging environment by a human or agent with a browser | Feature deployed or runnable; sample data seeded; screenshots captured |

CI workflow ownership is plan §14; `npm test` and `npm run test:e2e` are the CI `api` job commands. CI deliberately has no Playwright/Lighthouse (plan §14.4) — accessibility evidence is manual and recorded in the evidence doc.

### Test matrix sources

The authoritative case lists are plan §16.3:

- **US01:** login success/cookie flags/no token in body; identical 401 for unknown email, wrong password, inactive; validation 400; `/auth/me` with cookie/tampered/expired; logout 204 + cleared cookies + old cookie 401 + session revoked; `tokenVersion` mismatch 401; CSRF 403/passes; CORS allow/deny; boot rejects `CORS_ORIGIN=*` and `sameSite=none` without `secure`.
- **US18:** one email per creation; activation link, no password in body; token stored hashed, not raw; sender failure keeps the account, alerts admin once, logs, does not throw; HTML escaping; 24 h invite TTL and re-issue invalidation.
- **US19:** forgot-password 204 for known and unknown; reset valid/expired/reused/unknown; policy matrix (11/12/128/129, spaces, emoji, all-lowercase, blocklist); change-password wrong current 401 and old cookie 401 after rotation; no password/token in responses or captured logs.

The AC-level roll-up is the [AC matrix](ac-matrix.md); the case-level checklist is plan §16.3 and stays there to avoid a second source of truth.

---

## 3. Environments and capabilities

| Check | Agent sandbox (this session) | CI (`api` job) | Staging |
|---|---|---|---|
| `npm ci` / install | Only when a task requires it; T3 and T5 must **not** install (backend agent may be installing concurrently) | Yes | Build-time |
| `npm run lint`, `npm run build` | Available | Yes | Build-time |
| `npx prisma validate` / `npx prisma generate` | Available (no DB needed) | Yes | Build-time |
| `npm test` (unit) | Available once dependencies are stable | Yes | n/a |
| `prisma migrate deploy`, `prisma migrate diff --from-empty` | `migrate diff` static is available; **applying** is `DEFERRED (no DB)` | Yes | Pre-deploy |
| `npm run test:e2e` | `DEFERRED (no DB)` | Yes | Optional |
| Seed + demo data | `DEFERRED (no DB)` | Yes (test DB) | Demo seed only, `ALLOW_DEMO_SEED` |
| `scripts/smoke-staging.sh` | `DEFERRED (no staging)` | n/a | **Yes** |
| Mailtrap/Resend deliverability, Lighthouse, axe, screenshots | `DEFERRED (no staging/email)` | n/a | **Yes** (manual) |

Environment variable expectations are plan §15.5 (dev/CI/staging). The staging API must use `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`, and an exact `CORS_ORIGIN`; the frontend must send `credentials: 'include'` and `X-MARS-CSRF: 1` (plan §12).

### 3.1 Current limitation: no database in the sandbox

The agent environment has **no Docker daemon and no local Postgres server** (client binaries only). This is a hard limitation, not a choice:

- `docker compose up -d postgres` cannot be used; installing Docker or a database server is out of scope.
- Migrations cannot be applied, seeds cannot run, and e2e suites cannot execute locally.
- **Every DB-dependent check is labelled `DEFERRED (no DB)`** and belongs to the CI `api` job and/or staging. It is never reported as passed from the sandbox.
- Static substitutes are allowed but are not equivalence proofs: `npx prisma validate`, `npx prisma generate`, `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (generate SQL without applying), and reading the schema/migration SQL.
- The same rule already applies to staging: until Railway/Vercel exist, staging checks are `DEFERRED (no staging)`.

Honesty rule from the operating contract: never write "migration applied", "e2e passed", or "staging verified" unless the command actually ran in this environment.

---

## 4. Recorded baseline (8 Nov 2026)

The Lead recorded the pre-sprint baseline in `SPRINT1_PLAN.md` §1.3: **11/11 unit tests green** on 8 Nov 2026 (`npm test` in `scaffold/backend/app`), covering `auth.service`, `password-hasher`, `role-dashboard`, and `app.controller` (plan §1.1). That is the only suite result the team has recorded so far.

- This baseline is the **pre-reconciliation Bearer implementation**. It does not prove the target cookie/CSRF contract; it is a starting point for detecting regressions in the units it covers.
- **T3 did not re-run the suite.** The backend agent may be running installs / generating the Prisma client concurrently, so a rerun would be neither independent nor reproducible. The next authoritative run is T5 (independent verification of T1), followed by the Phase 2 e2e run in CI.
- The baseline will be superseded, not erased: T5 records the new command output in `docs/qa/verification-prisma-foundation.md`.

---

## 5. Test data

Seed accounts after the Prisma foundation (plan §18.4). Every seeded account except `invited@` shares the password in `SEED_PASSWORD` (≥12 characters, must satisfy policy; never committed). The inactive account keeps the password so the e2e test proves it is rejected by state, not by a failed verify:

| Email | Role | State | Used for |
|---|---|---|---|
| `admin@rafconsult.test` | `ADMIN` | active, password set | admin flows, US18 admin alert |
| `pm@rafconsult.test` | `PROJECT_MANAGER` | active | default login, staging smoke, demo |
| `worker@rafconsult.test` | `WORKER` | active | role mapping, permissions |
| `viewer@rafconsult.test` | `VIEWER` | active | role mapping, permissions |
| `inactive@rafconsult.test` | `WORKER` | inactive | identical generic 401 test |
| `invited@rafconsult.test` | `WORKER` | no password | US18 activation path; login must return the generic 401 |

Rules:

- **Unit tests** use in-memory fakes and the exported argon2 `HASH_OPTIONS`; no real accounts, no network.
- **E2E tests** run against a throwaway CI Postgres (`raf_pms_test`) with tables truncated between specs by `resetDatabase()` — not `migrate reset` per test (plan §14.3). Email uses `EMAIL_TRANSPORT=memory`; the memory inbox is asserted, never a real send.
- **Tokens in tests** are issued through the real service, not hand-written fixtures, so expiry/purpose/hashed-at-rest behaviour is exercised. Reset TTL is `RESET_TTL_SECONDS=900`; invite TTL is `INVITE_TTL_SECONDS=86400` (D6).
- **Staging** uses demo seed data only. No production data, no real customer email addresses, no real secrets. The seed refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` — set it for the demo window only, unset afterwards.
- **Smoke script credentials** come from `SMOKE_EMAIL` / `SMOKE_PASSWORD` in the operator's environment; the script contains no secrets and must never be given a committed value.
- **Evidence must be redacted.** Screenshots and logs may contain an email address; they must not contain passwords, JWTs, cookie values, reset tokens, or API keys.

---

## 6. Entry criteria

A task enters verification only when all of these hold:

1. The task is **claimed** and its write scope is known ([COLLABORATION §4](../team/COLLABORATION.md)).
2. The implementing agent reports the changed paths and the commands it ran.
3. Required environment is available: unit/lint/build in the sandbox; e2e in CI; staging checks in staging. Missing environment ⇒ the check is declared `DEFERRED`, not attempted and failed.
4. Test data is available or the check is deferred (seed exists for e2e/staging; fakes for unit).
5. No concurrent agent is mutating the same tree in a way that would invalidate the run (e.g. `npm install`, Prisma generation). If it is, wait for the Lead's go-ahead.

Phase entry follows the gates in [COLLABORATION §7](../team/COLLABORATION.md): Phase 1 foundation must be reviewed (T4) and independently verified (T5) before Phase 2 (US01 reconciliation) starts.

---

## 7. Exit criteria

### 7.1 Per task

- [ ] Acceptance criteria in the task are met, or each unmet/deferred item is explicitly listed with a reason.
- [ ] Only in-scope files changed; `git status --short` (read-only) reviewed.
- [ ] Applicable checks ran and their exact commands/results are in the evidence block ([evidence template](evidence-template.md)).
- [ ] DB-dependent and staging checks are marked `DEFERRED (no DB)` / `DEFERRED (no staging)` — not passed.
- [ ] No secrets or unredacted tokens/passwords in files, logs, or screenshots.
- [ ] Any defect is filed per the [defect workflow](defect-workflow.md) with a severity.
- [ ] Report sent to `lead`; task marked complete only when the above are true.

### 7.2 Per phase gate

- [ ] The phase's test matrix cases exist as tests (plan §16.3) or are listed as deferred with an owner and destination (CI/staging).
- [ ] `lint`, `build`, and unit tests are green for the affected app; e2e green in CI once the DB job exists.
- [ ] Architect review verdict recorded for design/security changes.
- [ ] QA verification verdict recorded (`PASS` / `PARTIAL` / `FAIL`) with evidence.
- [ ] Lead has committed the paths (agents never run Git writes).

### 7.3 Sprint DoD mapping (backlog §7.6 → plan §16.4)

| # | DoD item | How it is evidenced | Environment |
|---|---|---|---|
| 1 | All functional ACs fulfilled | [AC matrix](ac-matrix.md) rows for US01/US18/US19/landing; US18 AC2 and US19 AC3 recorded as **amended per `[OPEN-1]`, pending SM ratification** — the literal AC text is not claimed | Code + CI + staging |
| 2 | Pushed to main, peer reviewed | PR links and approvals (Lead owns; blocked while no GitHub credentials exist) | GitHub |
| 3 | Unit + integration tests pass in CI | CI `api` job URL and logs: lint, build, unit, e2e with Postgres | CI |
| 4 | UI responsive desktop/mobile | Landing screenshots at 320/768/1024/1440/1920 + 200% zoom | Manual/staging |
| 5 | US18/US19 verified e2e | Staging: create user → email arrives → reset link → login; Mailtrap/Resend evidence | Staging/manual |
| 6 | Deployed to staging, validated with sample data | Staging URLs + commit SHA + `scripts/smoke-staging.sh` PASS log | Staging |

DoD items owned by others (US02 UI, US03/US04) are **not** claimed by QA. The sprint is not marked done on this slice alone (plan §16.4, §22.3).

---

## 8. Status vocabulary (used in the AC matrix)

| Status | Meaning |
|---|---|
| `not yet implemented` | No code/test exists yet for the target contract; nothing to verify |
| `DEFERRED (no DB)` | Implemented or planned, but the check needs Postgres; runs in CI/staging |
| `DEFERRED (no staging)` | Needs the deployed staging environment; staging topology does not exist yet |
| `PASS (CI)` | Ran in the CI `api` job; evidence is the run URL/log |
| `PASS (staging)` | Ran against staging; evidence is the smoke log/screenshot |
| `PARTIAL` | Some sub-checks passed, others deferred/failed; the gap is named |
| `FAIL` | Ran and failed; a defect exists with a severity |
| `BLOCKED` | Cannot start because an input/dependency is missing; name it |

Status changes are made only when the named evidence exists. The matrix is updated by QA; the Lead reviews it at each gate.

---

## 9. Evidence and reporting

- Every task produces a filled-in [evidence block](evidence-template.md): commands and results, AC/acceptance statuses, deferred checks, artifact paths, defects.
- Screenshots and logs go under `docs/qa/evidence/<yyyy-mm-dd>-<task>/` with descriptive filenames (`login-cookies-devtools.png`, `smoke-staging-pass.log`). They are referenced from the evidence doc, not pasted as base64.
- The consolidated `docs/sprint1-evidence.md` (plan §16.5) is assembled from Day 5 onward; QA contributes the AC matrix status and verification sections. It is not created in Phase 1.
- Reports to the Lead use the [COLLABORATION §5](../team/COLLABORATION.md) format and stay under 200 words unless a failure needs a log tail.
- **Do not** mark a deferred item as passed, do not report a command you did not run, and do not cite a test that does not exist.

---

## 10. Ownership and independence

| Activity | Owner | Constraint |
|---|---|---|
| Write tests for feature code | Implementing coder (backend-dev / frontend-dev) | Tests land with the feature; a task is not done without them (COLLABORATION §6) |
| Fix defects | Implementing coder in their scope | Reviewers and QA do not edit source; a non-trivial fix is a new Lead-created task |
| Independent verification | `qa-engineer` | Reproduce from the task, not from the implementation report; never modify source |
| Design/security review | `architect` | Read-only on code; findings, not edits |
| Severity triage, adjudication, Git | `lead` | Only the Lead commits and closes tasks |
| Manual/frontend evidence | `frontend-dev` / Lead by agreement | QA re-checks landing a11y claims before the DoD call |

---

## 11. Known gaps and risks

| Item | Effect on QA | Handling |
|---|---|---|
| No Docker/Postgres in the sandbox | E2E, migrations, seeds, DB state cannot be checked locally | `DEFERRED (no DB)`; CI/staging owns them; static `prisma validate`/`generate`/`diff` only |
| No staging yet (Phase 5) | Smoke script and DoD staging checks cannot run | `DEFERRED (no staging)`; script is written and syntax-checked now, run on Day 6–10 |
| No GitHub credentials | No push/CI; evidence cannot cite run URLs yet | Local commits only; Lead tracks the blocker (COLLABORATION §3) |
| Rate limiting absent (D9) | Brute-force resistance is not tested/claimed | Known gap, not a defect; stated in evidence and demo (plan §7.9) |
| No automated a11y/Lighthouse CI (plan §14.4) | Landing accessibility is manual | Manual axe + keyboard + responsive screenshots; Lighthouse targets recorded, not gated |
| `[OPEN-1]` pending SM amendment | US18 AC2 and US19 AC3 cannot be claimed literally | Implement the locked deviation (link-only welcome email; 12–128 length policy) and label evidence "met per agreed deviation, pending SM amendment" |
| Resend test-sender limitation (plan §15.4) | Real deliverability is limited to the account owner | State it explicitly in staging evidence; do not hide a failed send |
| Node 26 local vs Node 24 CI | A local pass is not identical to CI | CI pins Node 24 (plan §14.3); treat CI as authoritative |
| Concurrent agent installs | A local rerun during installs is flaky and non-reproducible | Wait for Lead go-ahead (T5 rule); record only stable runs |

---

## 12. Deferred checks register

Until CI/staging exists, the following groups are tracked as deferred. Each must move to a named environment before the DoD call:

| Group | Deferred reason | Destination | Verification owner |
|---|---|---|---|
| All `npm run test:e2e` cases (plan §16.3 US01/US18/US19) | No DB | CI `api` job | `qa-engineer` (T5/T6) |
| `prisma migrate deploy`, seed, `resetDatabase()` behaviour | No DB | CI (throwaway DB), staging pre-deploy | `backend-dev` implements; QA verifies in CI |
| DB state assertions: session `revoked_at`, `token_version`, hashed reset token row, TTL arithmetic | No DB | CI e2e | QA |
| `scripts/smoke-staging.sh` full run | No staging | Staging (Railway) | QA / Lead |
| Email deliverability (Mailtrap/Resend), welcome email content screenshots | No email transport/staging | Staging + Mailtrap/Resend | QA / Lead |
| Landing build + responsive + keyboard + axe + Lighthouse | Landing not started; no staging | Local build + Vercel staging | `frontend-dev`, re-checked by QA |
| CORS allow/deny in a real cross-site browser | Needs two origins/browser | Staging (Vercel → Railway) | QA |

**Rule:** a deferred group is closed only by a run in its destination environment, with the command and output recorded. It is never closed by inspection.

**Tooling status (9 Nov 2026):** [`scripts/smoke-staging.sh`](../../scripts/smoke-staging.sh) is written and executable. `bash -n` passes, and its control flow was self-checked against a local stub API (24/24 PASS) and a dead endpoint (exit 1, no false PASS lines). It has **not** been run against staging because staging does not exist yet — that run remains `DEFERRED (no staging)` and must attach the deployed commit SHA and log.
