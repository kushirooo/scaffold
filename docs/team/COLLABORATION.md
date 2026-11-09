# Team Collaboration Protocol — MARS Sprint 1

| Field | Value |
|---|---|
| Owner | Lead |
| Applies to | Every agent working in this repository |
| Sprint window | 9–18 Nov 2026 |
| Plan | `/home/anoshizuku/Projects/SPRINT1_PLAN.md` |
| Repository | `/home/anoshizuku/Projects/scaffold` |
| Integration branch | `feat/prisma-foundation` (from `wip/us01-bearer-baseline`, tag `pre-reconcile`) |
| Status | Active for Phase 1 |

This document is the operating contract between the Lead and the execution agents. The sprint plan defines **what** we build; this document defines **how we work without stepping on each other**.

---

## 1. Operating model

The team is event-driven, not clock-driven. There are no AI stand-ups and no scheduled handoffs. Work moves through one shared task board with explicit owners, write scopes, and review gates.

- **One task in progress per agent.** No agent starts a second task until the first is reported.
- **One shared checkout.** Agents write to disjoint paths in the same working tree. They do not create branches or worktrees.
- **The Lead is the only Git writer.** Agents produce files; the Lead reviews, stages path-by-path, and commits.
- **Every coding task is reviewed twice:** once for design/security (architect) and once for independent verification (QA). A task is not done because the code exists.
- **Humans remain the release owners.** US02 and the portal frontend are still owned by the human teammates named in the sprint plan. AI agents must not implement those surfaces or edit their files.

### Roster

| Member | Role | Primary responsibility |
|---|---|---|
| `lead` | Integrator / delivery lead | Git, task creation, scope control, review triage, integration, staging, final answer |
| `backend-dev` | Backend engineer | US01/US18/US19 implementation: Prisma, auth, email, reset |
| `architect` | Architecture & security reviewer | ADRs, design consistency, schema/security review |
| `qa-engineer` | QA engineer | Test strategy, independent verification, smoke tooling, evidence |
| `frontend-dev` | Frontend engineer (spawned in the landing window) | Landing shell at `/`, DESIGN tokens, accessibility |

`frontend-dev` is deliberately **not** spawned yet. The agreed order is three backends first, landing shell last. Spawning an idle frontend agent would add coordination cost without throughput.

---

## 2. Write scopes

Scopes are disjoint. A file belongs to exactly one owner at a time.

| Owner | May write | Must not write |
|---|---|---|
| `lead` | `scaffold/docs/team/**`, git metadata, integration fixes after review | Feature code without a task; another agent's active files |
| `backend-dev` | `scaffold/backend/app/prisma/**`, `src/prisma/**`, `src/database/**`, `src/users/**`, `src/sessions/**`, `src/app.module.ts`, `package.json`, `package-lock.json`, `tsconfig*.json`, `.gitignore`, `.env.example` — and later `src/auth/**`, `src/email/**`, `src/accounts/**`, `test/**` when their phase starts | `frontend/**`, root docs, `docs/adr/**`, `docs/qa/**`, `docs/reviews/**` |
| `architect` | `scaffold/docs/adr/**`, `scaffold/docs/reviews/**`, `scaffold/docs/third-party-notices.md` | All source code; other agents' docs |
| `qa-engineer` | `scaffold/docs/qa/**`, `scaffold/scripts/**` | All source code; ADRs; review docs |
| `frontend-dev` (later) | `scaffold/frontend/app/**`, `scaffold/docs/frontend/**` | Backend, ADRs, QA docs |

Rules:

1. **Never edit outside your scope**, even for a one-line fix. Message the Lead with the file, the reason, and the proposed change. The Lead either expands the scope or does it.
2. **Shared files are owned, not shared.** `package.json`, `app.module.ts`, `schema.prisma`, `.env.example`, `tsconfig*.json` belong to `backend-dev` during Phase 1. No other agent touches them.
3. **Do not reformat or rename unrelated files.** It destroys reviewability and creates phantom conflicts.
4. If you find a bug in another owner's scope, report it; do not fix it.

---

## 3. Git protocol

The Lead owns Git because all agents share one checkout. Parallel `git add`, branch switches, or commits would race and could commit another agent's half-finished work.

### Agents must never run

`git add`, `git commit`, `git switch`, `git checkout`, `git reset`, `git restore`, `git stash`, `git push`, `git rebase`, `git merge`, `git tag`.

### Agents may run

`git status`, `git diff`, `git log`, `git show` — read-only inspection is encouraged before reporting.

### Lead rules

- Stage **explicit paths**, never `git add -A` or `git add .`.
- Commit one logical task at a time, after its review gate.
- Commit messages: `feat(prisma): …`, `feat(auth): …`, `feat(email): …`, `feat(reset): …`, `docs(adr): …`, `test(qa): …`, `chore(ci): …`.
- Do not rewrite `main`. Do not force-push.
- The branch is shared; agents do not need to know its name beyond what the Lead tells them.

### Current Git state

| Item | State |
|---|---|
| `wip/us01-bearer-baseline` | Tagged `pre-reconcile` (local) |
| `feat/prisma-foundation` | Checked out, based on the WIP baseline |
| Remote | Draft [PR #1](https://github.com/kushirooo/scaffold/pull/1) on `feat/prisma-foundation`; CI `api` + `web` green |
| `main` | Untouched at `895d6f3` |

> **History note:** on 9 Nov the local feature branch was rewritten to the GitHub
> noreply identity (`130390028+kushirooo@users.noreply.github.com`) so GitHub's
> email-privacy rule would accept the push. Commit hashes quoted in earlier
> review/QA evidence are pre-rewrite snapshots; use the branch and tags instead.

---

## 4. Task lifecycle and review gates

```
Lead creates task (scope + acceptance)
        │
        ▼
Agent claims (in_progress) ──► implements ──► self-checks ──► reports ──► completes
                                                              │
                                              ┌───────────────┴───────────────┐
                                              ▼                               ▼
                                   Architect review (design/security)   QA verification (independent)
                                              │                               │
                                              └───────────────┬───────────────┘
                                                              ▼
                                                   Lead resolves findings
                                                              │
                                                              ▼
                                                   Lead commits + closes
```

1. **Claim before work.** Use `team_task_get` to read the latest revision, then `team_task_update` with `action: "claim"` and the current revision. Do not work a task you have not claimed.
2. **Self-check before reporting.** Run the checks named in the task. Paste commands and results, not adjectives.
3. **Report before completing.** Send the report to `lead` with `send_message`, then mark the task complete only if its acceptance criteria are met.
4. **Review tasks are separate.** T1 (implementation) is not complete as a quality gate until T4 (architecture review) and T5 (QA verification) pass. The Lead may reopen T1 if a review finds a blocking issue.
5. **Fix tasks are new tasks.** If a review finds more than a trivial correction, the Lead creates a fix task with its own scope; the reviewer does not edit code.
6. **No silent completion.** A task marked complete without a report and evidence is treated as not done.

### Status vocabulary

`pending` → not started · `in_progress` → claimed and being worked · `completed` → acceptance met and evidence reported. Review outcomes are `PASS`, `PASS WITH CHANGES`, or `BLOCK`.

---

## 5. Communication protocol

- **Reports and blockers go to `lead`** via `send_message`. Do not message other agents directly unless the Lead introduces the pairing; cross-agent chatter causes conflicting instructions.
- **One message per task milestone.** No progress spam. If a task will take many steps, send one "starting" note only if the Lead asked for it.
- **Blockers are immediate.** If you cannot proceed — missing tool, failing build you cannot fix within scope, ambiguous requirement — message the Lead with: what you tried, the exact error, the options, and your recommendation. Do not sit on a blocker.
- **No scope invention.** If the plan is ambiguous, report the ambiguity; do not invent product behavior. Decisions D1–D12 in the plan are already made; `[OPEN-1]`–`[OPEN-3]` remain open and must be described as pending.

### Report format

```
TASK <id> — <status>
Changed: <paths>
Checks: <command> → <result>; <command> → <result>
Decisions: <anything you chose inside the task, with rationale>
Risks/blockers: <none | concrete>
Next: <what the Lead should review or what is needed>
```

Keep it under 200 words unless a failure needs a log tail.

---

## 6. Quality bar

Every coding task must satisfy all of these before it is reported:

| Gate | Requirement |
|---|---|
| Build | `npm run build` passes from `scaffold/backend/app` (or frontend equivalent) |
| Lint | `npm run lint` passes; no new suppressions |
| Tests | `npm test` passes; new behavior has a test; no skipped tests added |
| Types | No `any`, `@ts-ignore`, or non-null assertion added without a one-line justification |
| Secrets | No `.env`, key, token, or password in a tracked file, log, or fixture |
| Scope | Only files in the task's write scope changed |
| Errors | Generic messages where the AC requires them (login, reset) |
| Docs | Public behavior/contract changes update the relevant doc |
| Evidence | Commands and results are reproducible from the report |

Database-dependent checks (migrations applied, e2e, staging) are **not** claimed locally while no database is available. They are deferred to CI/staging and must be listed as deferred, not passed.

---

## 7. SDLC phases and gates

| Phase | Content | Exit gate |
|---|---|---|
| 0. Baseline | Preserve uncommitted US01; tag `pre-reconcile` | Done by Lead |
| 1. Foundation + local DB (complete) | Prisma schema/client/repositories, ADRs, QA harness, DB bring-up | T1/T4/T5 green; T9–T11 DB tests and QA PASS |
| 2. US01 reconciliation (API complete; CI/staging pending) | httpOnly cookies, `tokenVersion`, CSRF, credentialed CORS | Contract v2 published; local e2e 25/25; CI/staging gates pending |
| 3. US18 | Email module, seam, welcome link, non-atomic failure | Seam test + Mailtrap evidence; review/verify |
| 4. US19 | Policy, blocklist, reset/change endpoints, invalidation | Edge-case matrix green; review/verify |
| 5. CI/staging | Postgres CI, Resend, Railway, Vercel | Staging DoD validation |
| 6. Landing | `/`, tokens, hero, sections, a11y | Build + Lighthouse + responsive evidence |
| 7. Release | RC tag, demo, retro, handoff | Partner review complete |

Phase entry requires the previous gate; exceptions are explicit Lead decisions, recorded in the task.

---

## 8. Environment constraints

| Constraint | Impact | Rule |
|---|---|---|
| Local PostgreSQL 18 is **available** | `127.0.0.1:5432`; database `raf_pms` seeded with six users; test/e2e databases `raf_pms_test` and `raf_pms_e2e` | Use it for migrations, seed and DB-backed tests. Never point tests at `raf_pms`. If the DB is down, report to the Lead; do not recreate it blindly |
| Docker CLI is **not** reachable inside DSH | The daemon runs on the host but the sandbox lacks the docker gid and blocks socket access | Do not run `docker`/`docker compose` inside DSH. The human manages the container outside; agents use TCP 5432 only |
| No `sudo` / package installs | Cannot add system services from DSH | Use project dependencies only; report if truly blocked |
| No GitHub credentials | Cannot push or trigger CI | Local commits only; Lead tracks the push blocker |
| Node 26 locally, Node 24 in CI | Minor version drift | Pin CI to 24; do not use Node-26-only APIs |
| Shared checkout | Concurrent writes can collide | Stay in scope; never run git writes; announce shared-file needs |

**DB commands** (from `scaffold/backend/app`): `npm run db:migrate`, `npm run db:seed`, `npx prisma migrate status`. `npm run test:db` runs against `raf_pms_test`; `npm run test:e2e` runs against `raf_pms_e2e`. Both refuse `raf_pms`; create the two databases once if missing.

**Honesty rule:** never write "migration applied", "e2e passed", or "staging verified" unless the command actually ran in this environment. Local DB checks are now runnable and must be run, not deferred; only CI/staging-only checks may be labelled `DEFERRED`.

---

## 9. Conflict and escalation

| Situation | Action |
|---|---|
| Need to edit a file outside scope | Message Lead with path, reason, proposal. Wait for approval |
| Two agents need the same file | Lead serialises: one owns it, the other waits or gets a follow-up task |
| Build/test fails outside your scope | Report to Lead with the error; do not fix another owner's code |
| Requirement ambiguous | Report the ambiguity and the options; Lead decides or escalates to the human |
| Human changes scope | Lead updates plan, tasks, and scopes before work resumes |
| Review disagrees with implementation | Lead adjudicates against the plan and ADRs; the plan wins over preference |

---

## 10. Task-level definition of done

A task is done when all of the following are true:

- [ ] Acceptance criteria in the task are met.
- [ ] Only in-scope files changed.
- [ ] Lint, build, and unit tests pass (or the deferred checks are explicitly listed).
- [ ] Evidence is reproducible from the report.
- [ ] Architect review (if the task changes design/security) is `PASS` or findings resolved.
- [ ] QA verification (if the task changes behavior) is `PASS` or findings resolved.
- [ ] Lead has committed the paths with a conventional message.
- [ ] The task board reflects reality.

---

## 11. Phase 1 task map

| Task | Owner | Depends on | Output |
|---|---|---|---|
| T1 Prisma foundation | `backend-dev` | Baseline | Schema, client/service, repositories, migration SQL, seed |
| T2 ADRs + decision log | `architect` | — | `docs/adr/0001–0004`, decision log, third-party notice stub |
| T3 QA strategy + smoke script | `qa-engineer` | — | `docs/qa/*`, `scripts/smoke-staging.sh` |
| T4 Architecture review of T1 | `architect` | T1 | `docs/reviews/prisma-foundation-review.md` |
| T5 Independent verification of T1 | `qa-engineer` | T1 | `docs/qa/verification-prisma-foundation.md` |

Phase 1 does **not** include cookie transport, CSRF, email, or reset endpoints. Those are Phase 2–4; starting them early would couple review to unfinished foundations.

---

## 12. Standing agreements

1. **The plan is the source of truth.** This document does not change scope; it changes how we execute it.
2. **`[OPEN-1]`, `[OPEN-2]`, `[OPEN-3]` stay open.** No agent presents them as resolved.
3. **The human owns the sprint review.** Agents produce evidence; the Lead presents it.
4. **Small, reviewable increments.** One task, one report, one commit.
5. **When in doubt, ask the Lead early.** A five-minute question is cheaper than a reverted commit.
