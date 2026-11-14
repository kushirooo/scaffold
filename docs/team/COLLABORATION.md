# Team Collaboration Protocol — MARS Sprint 1

| Field | Value |
|---|---|
| Owner | Lead |
| Applies to | Every agent working in this repository |
| Sprint window | 9–18 Nov 2026 |
| Plan | `/home/anoshizuku/Projects/SPRINT1_PLAN.md` (reference only — never read in full unless asked) |
| Repository | `/home/anoshizuku/Projects/scaffold` |
| Status | Active — lean workflow from 9 Nov 2026 |

This file is deliberately short. It tells you how to work, not what to build. The sprint plan and the task description hold the what; this holds the how.

## 0. The one rule that matters

Read only what your task needs. A 1-page working brief plus the files you are about to change is enough. Do not re-read the sprint plan, the ADRs, or another agent's docs unless the task explicitly says to. If the brief is missing a detail, ask the Lead — do not go hunting through 1,400 lines.

### Before you start: the card is the brief

Every card carries these five fields. The task is not claimable without `Read:`; ask the Lead to add it.

```
Scope: <paths>
AC: <1–3 lines>
Checks: <commands>
Evidence: none | append to <doc>
Read: <plan §n / ADR / contract §n>
```

- `Scope:` is your write permission. The area lists in §3 are defaults, not permission.
- `Read:` is the whole reading list. Cite plan sections by number; never open the plan in full.

### Write once, small

- Report ≤120 words (200 if a failure needs a ≤30-line log tail). No tables, headings, or pasted documents.
- One new doc only if the card names the path. Otherwise append a dated section to the story's living evidence doc.
- Caps: evidence/verification ≤60 lines · review ≤40 · ADR ≤60 · one new doc per task · ≤3 artifacts, ≤30 lines each. No raw logs in git.
- No `-fixes`, `-reverify`, or `-v2` docs. Append instead; `PASS` with no findings is a report line, not a document.

### Stop rules

- Two attempts at the same error → report, stop digging.
- Third file outside `Scope:` → stop and report.
- >400 changed lines or >1 test suite → split before starting.
- No opportunistic refactor, rename, or reformat.

**Historical docs:** do not read or update these unless the card names them: `docs/qa/strategy.md`, `docs/qa/evidence-template.md`, `docs/qa/defect-workflow.md`, `docs/qa/ac-matrix.md`, `docs/reviews/prisma-foundation-review.md`, `docs/qa/verification-prisma-foundation*.md`. They describe the old, heavier workflow.

## 1. Operating model

Two standing execution agents — implementer and reviewer — plus the integrator. `frontend-dev` is spawned only for the landing window. There is no standing QA or architect agent.

| Agent | Role | Writes |
|---|---|---|
| `lead` | Integrator: Git, task creation, scope control, final review, staging | `docs/team/**`, `docs/adr/**`, integration fixes |
| `implementer` | Builds the story: code, tests, the doc the card names | Task `Scope:` paths |
| `reviewer` | Adversarial read of the diff. Finds bugs. Does not re-run the full suite | `docs/reviews/**` only |
| `frontend-dev` | Spawned only for the landing window | `frontend/app/**` |

- **One task in progress per agent.** One shared checkout. Disjoint write scopes.
- **The Lead is the only Git writer.** Agents never run `git add`/`commit`/`push`/`switch`/`reset`.
- **CI is the independent verifier.** Not a QA agent. A review + green CI is the gate.
- **Humans own the release.** US02 and the portal frontend are human-owned; agents must not touch them.
- **Reuse the same implementer and reviewer across tasks.** A respawn is a fresh context and a fresh reread; do not spawn per task.
- **Manual checks — browser, email delivery, staging — are the Lead's, or a one-off QA spawn the Lead authorizes for that gate.** Never a standing role.

Why no separate QA agent: CI runs the same code checks cheaper. QA is worth spawning only for what CI cannot do — browser flows, cookies, email delivery, staging. For code verification, review + CI is the gate.

## 2. Per-task workflow

Flow: card → claim → build + targeted tests → report → one review → Lead push → CI green → close.

1. **Claim before work.** `team_task_get` → `team_task_update` with `action: "claim"`. Do not work an unclaimed task.
2. **Run targeted tests while building.** `npm test -- --changed`, `vitest run <file>`, `npm run test:e2e -- <file>`. The full suite is for the end, not for every save.
3. **Self-check at the end.** Lint, build, and the affected suite. Paste commands and results, not adjectives. Docs-only tasks run link/grep checks only — no build, no suite.
4. **Report and complete.** Use the §4 format. Mark complete only when acceptance is met and the card's `Evidence:` line is satisfied.
5. **Review once, not in chains.** The reviewer reads the diff and returns findings. The implementer fixes in the same task. No re-review unless a design decision changed. A fixed bug is not a new design.
6. **CI is trailing, not a blocker for the agent.** The Lead commits and pushes; on red CI the same task reopens. No second review.
7. **No silent completion.** A task marked complete without a report and evidence is treated as not done.

## 3. Write scopes

A file belongs to exactly one owner at a time. Never edit outside your `Scope:`, even for a one-line fix — message the Lead with the path, reason, and proposal.

| Owner | Writes | Never writes |
|---|---|---|
| `lead` | `docs/team/**`, `docs/adr/**`, git metadata, integration fixes | Feature code without a card |
| `implementer` | The card's `Scope:` paths, plus the one doc the card names | Anything outside `Scope:`; other agents' files |
| `reviewer` | `docs/reviews/<story>-review.md` (one per story, appended) | All source code; evidence docs |
| `frontend-dev` (landing window) | `frontend/app/**` | Backend, ADRs, review docs |

Doc owners: `docs/qa/verification-<story>.md`, `docs/api-contract-<story>.md`, and `docs/third-party-notices.md` go to the implementer only when the card names them; `docs/reviews/<story>-review.md` to the reviewer; `docs/adr/**` to the Lead; manual email/browser/staging evidence to the Lead or an authorized one-off QA spawn.

Rules:

1. **Task scope beats area scope.** The `Scope:` line is the only write permission for this task.
2. **Shared files are owned, not shared.** `package.json`, `app.module.ts`, `schema.prisma`, `tsconfig*.json`, `.env.example` have one owner per task. Announce edits in your report.
3. **No drive-by edits.** Do not reformat or rename unrelated files; report a bug in another owner's scope instead of fixing it.

## 4. Communication

- **Reports and blockers go to `lead`** via `send_message`. One message per milestone; no progress spam.
- **Blockers are immediate.** Send what you tried, the exact error, the options, and your recommendation. Do not sit on a blocker.
- **Board comments only for blockers or decisions.** No status notes; the card status is the status.

Report format:

```
TASK <id> — <status>
Changed: <paths>
Checks: <command> → <result>; <command> → <result>
Decisions: <anything you chose, with rationale>
Risks/blockers: <none | concrete>
Next: <what the Lead should review or what is needed>
```

Under 120 words (200 if a failure needs a ≤30-line log tail). No tables, headings, or pasted documents.

## 5. Quality bar

Every task must satisfy these before it is reported:

| Gate | Requirement |
|---|---|
| Lint | `npm run lint` passes; no new suppressions |
| Build | `npm run build` passes |
| Tests | Full suite passes at the end; new behavior has a test; no skipped tests added |
| Types | No `any`, `@ts-ignore`, or non-null assertion without a one-line justification |
| Secrets | No `.env`, key, token, or password in a tracked file, log, or fixture |
| Scope | Only files in the task's `Scope:` changed |
| Errors | Generic messages where the AC requires them (login, reset) |
| Contract | Public behavior changes update the doc the card names |
| Evidence | Commands and results are reproducible from the report |

Database checks are runnable locally — see §7. Do not mark a DB check `DEFERRED` when the database is up.

## 6. Review rubric

The reviewer answers these, in order. Anything failing is a finding with severity — file:line — issue — suggested fix.

```markdown
## Reviewer checklist
- [ ] Does any path expose a token, password, or cookie value in a response body or log?
- [ ] Is the guard checking session, active user, role, and tokenVersion — not just the signature?
- [ ] Is CSRF enforced before auth on every non-GET, including login/logout?
- [ ] Are cookie flags set on both set and clear (HttpOnly, Path, SameSite, Secure where required)?
- [ ] Do the new tests assert real behaviour, or just that a mock was called?
- [ ] Does any test pass trivially when the logic is inverted? (If feasible, reason it through.)
- [ ] Is there any scope creep — code that belongs to another story?
- [ ] Do the error messages match the AC (generic where required)?
```

Verdict: `PASS`, `PASS WITH CHANGES`, or `BLOCK`. Return the findings and verdict only — do not paste or answer the checklist. Cap the review at 40 lines. Do not edit code.

## 7. Environment

| Item | State | Rule |
|---|---|---|
| Local PostgreSQL 18 | `127.0.0.1:5432`; `raf_pms` (6 seeded users), `raf_pms_test`, `raf_pms_e2e` | Use it. Never point tests at `raf_pms`; both test suites guard against it |
| Docker CLI | Not reachable inside DSH | Do not run `docker`/`docker compose` in DSH. The human manages the container outside |
| `sudo` / installs | Blocked in DSH | Use project dependencies only; report if truly blocked |
| Git | Lead only | Agents run read-only `git status`/`diff`/`log`/`show`, scoped by path |
| Node | 26 local, 24 CI | Pin CI to 24; no Node-26-only APIs |

Commands (from `scaffold/backend/app`):

```bash
npm run db:migrate     # prisma migrate deploy
npm run db:seed
npm run test:db        # raf_pms_test
npm run test:e2e       # raf_pms_e2e
```

**Honesty rule:** never write "migration applied", "e2e passed", or "staging verified" unless the command actually ran. Local DB checks are runnable and must be run; only CI/staging-only checks may be labelled `DEFERRED`.

## 8. Git

The Lead owns Git because all agents share one checkout. Parallel `git add`/`commit`/`switch` would race.

Agents never run: `git add`, `commit`, `switch`, `checkout`, `reset`, `restore`, `stash`, `push`, `rebase`, `merge`, `tag`.
Agents may run: `git status`, `diff`, `log`, `show` — scoped to their paths (`git diff -- <paths>`), ignoring other agents' uncommitted files.

Lead rules: stage explicit paths (never `git add -A`), one logical commit per task, conventional messages (`feat(auth|email|reset|prisma|web): …`, `fix(…): …`, `docs(adr|qa|team|api): …`, `test(qa): …`, `ci: …`, `chore: …`). Do not rewrite `main`. Do not force-push.

## 9. Phases

| Phase | Content | Exit gate |
|---|---|---|
| 0. Baseline | Preserve US01; tag `pre-reconcile` | Done |
| 1. Foundation + DB | Prisma, ADRs, QA harness, DB bring-up | Done — counts on the board/CI |
| 2. US01 reconciliation | Cookies, `tokenVersion`, CSRF, credentialed CORS | API complete; contract v2; CI green; frontend + staging pending |
| 3. US18 | Email module, seam, welcome link, non-atomic failure | Seam test + email evidence |
| 4. US19 | Policy, blocklist, reset/change, invalidation | Edge-case matrix green |
| 5. CI/staging | Resend, Railway, Vercel | Staging DoD validation |
| 6. Landing | `/`, tokens, hero, sections, a11y | Build + Lighthouse + responsive evidence |
| 7. Release | RC tag, demo, retro, handoff | Partner review complete |

Phase entry requires the previous gate; exceptions are explicit Lead decisions, recorded in the card. Each gate records ledger tokens and doc lines added; a 2× jump triggers a scope check before the next phase.

## 10. Definition of done (task)

- [ ] Acceptance criteria met.
- [ ] Only in-scope files changed.
- [ ] Lint, build, and the full suite pass (docs-only tasks: link checks pass).
- [ ] New behavior has a test that fails when the logic is broken.
- [ ] Contract/docs updated if public behavior changed.
- [ ] Reviewer verdict is `PASS` or findings resolved.
- [ ] CI green after the Lead pushes; a red run reopens the same task.
- [ ] Lead committed the paths with a conventional message.
- [ ] Report within the §4 cap; evidence within the §0 caps; no unnamed new doc.
- [ ] Task board reflects reality.

## 11. Standing agreements

1. **The plan is the source of truth for scope.** This document changes how we execute, not what we build.
2. **`[OPEN-1]`, `[OPEN-2]`, `[OPEN-3]` stay open.** No agent presents them as resolved.
3. **Humans own the sprint review.** Agents produce evidence; the Lead presents it.
4. **Small, reviewable increments.** One task, one report, one commit.
5. **When in doubt, ask the Lead early.** A five-minute question is cheaper than a reverted commit.
6. **Docs are artifacts, not tasks.** Write an ADR for irreversible decisions; do not write a protocol for the protocol. The §0 caps are hard; raising one requires the Lead to write it in the card.
