# Defect Workflow — MARS Sprint 1

| Field | Value |
|---|---|
| Owner | `qa-engineer` (process) / `lead` (triage and adjudication) |
| Applies to | Every defect found in US01, US18, US19, the landing shell, and the supporting Prisma/CI/staging work |
| Contract | [`../team/COLLABORATION.md`](../team/COLLABORATION.md) §4, §5, §9 |
| Quality bar | [`strategy.md`](strategy.md); AC roll-up in [`ac-matrix.md`](ac-matrix.md) |
| Last updated | 9 Nov 2026 (T3) |

A defect is a demonstrated deviation from the plan, an AC, an ADR, or the quality bar. This workflow makes sure every defect has a severity, an owner, evidence, and an independent re-check before it is closed. It does not create new scope: a fix that needs more than a trivial correction becomes a new Lead-created task.

---

## 1. Defect vs. other findings

| Kind | Definition | Example | Action |
|---|---|---|---|
| **Defect** | The implementation contradicts an AC, the plan, an ADR, or the quality bar | Login returns a distinct "email not found" message (violates US01 AC2) | This workflow; severity required |
| **Review finding** | An improvement, risk, or question from the architect that is not a verified contradiction | "Consider a shared constant for the TTL" | Architect review doc; Lead decides whether it becomes a task |
| **Known gap** | A limitation already stated and accepted in the plan | No rate limiting (D9, plan §7.9) | Not a defect. State it in evidence/demo; do not "fix" it in Sprint 1 |
| **Open item** | A backlog/plan item pending external ratification | `[OPEN-1]` welcome-email credentials vs link; `[OPEN-2]`, `[OPEN-3]` | Not a defect. Label evidence "pending ratification"; never present as decided |
| **Test gap** | A required test case from plan §16.3 is missing or skipped | No e2e for expired reset token | Treated as a defect against the quality bar (severity by AC impact), or a dedicated QA/fix task |
| **Environment limitation** | A check cannot run here | `DEFERRED (no DB)` e2e | Not a defect. Record as deferred with destination and owner |

If a finding's classification is unclear, ask the Lead in the same report — do not downgrade it silently to "note".

---

## 2. Severity

| Severity | Definition | Examples (Sprint 1) | Handling | Gate effect |
|---|---|---|---|---|
| **P0 — Critical** | Security bypass, secret exposure, data loss/corruption, or the API/demo is unusable. Stop-the-line. | Auth bypass without a valid session; JWT/token in the response body or `localStorage`; password/reset token/API key in a tracked file or log; `mars_at` not `HttpOnly`; CSRF guard disabled/exempted; destructive or missing migration SQL; `/health` down; `token_version`/guard check removed | Message `lead` **immediately** (one message: what, where, evidence, proposed fix). Do not continue unrelated work until triaged. Coder fixes in its own scope or a Lead fix task | Blocks merge, phase gate, and demo until `VERIFIED` |
| **P1 — High** | A primary AC fails on the happy or main failure path; a security control is weaker than the plan but not bypassed. | US01 login/logout broken with a cookie; logout leaves the session valid; invalid credentials leak which field failed; CSRF header accepted but not enforced in staging; CORS missing `Allow-Credentials`/exact origin; reset with expired/reused token succeeds; reset token stored raw; password change/reset does not invalidate sessions; welcome email never sent; US18 failure path throws or loses the account; seeded accounts unusable | Report to `lead` with evidence; assigned owner fixes; QA reverifies before the gate/commit | Blocks the phase gate and the affected AC row; must be fixed before the DoD call |
| **P2 — Medium** | An edge-case or secondary AC failure, a spec deviation without security impact, or a check that is flaky/false. | Validation returns `500` instead of `400`; admin notified twice on sender failure; TTL constant off but configurable; invalid-token message differs from the generic text; landing contrast below 2.2 AA on one element; Lighthouse target missed; responsive overflow at 320 px; smoke script false PASS on a missing header | Report to `lead`; fix within the phase or schedule as a follow-up task; reverify | Does not block unrelated work; must be resolved or explicitly accepted by the Lead before the DoD call |
| **P3 — Low** | Cosmetic, copy, naming, test hygiene, or non-functional doc issue with no AC/security impact. | Typo in a comment; inconsistent test name; unclear error text not covered by an AC; missing doc link; lint warning that is not a gate | Batch in the task report or a later cleanup task; may be deferred to the retro | No gate effect; recorded so it is not lost |

Rules:

- **The Lead sets or ratifies severity.** The reporter proposes it with justification; the Lead may raise it (never silently lower a security issue).
- **Two severities at once is a P0/P1 default.** If unsure between P1 and P2, report P1 and let the Lead downgrade.
- **Do not invent severity to skip a gate.** A P1 hidden as P3 is a process defect and is reopened as P0/P1.
- A P0/P1 fix that touches another owner's files needs the Lead's scope decision; the reporter does not edit outside its scope ([COLLABORATION §2](../team/COLLABORATION.md)).

---

## 3. Report format

Every defect is reported with this block (in the task report and, once tracking starts, in `docs/qa/defects.md`):

```markdown
## DEF-<n>: <one-line title>

- Severity: P0 | P1 | P2 | P3 (proposed; Lead ratifies)
- Story / AC: US01 AC2 (or "supporting check — CSRF")
- Task: <task id> / <affected file:line>
- Environment: agent sandbox (no DB) | CI run <url> | staging <url> | manual browser
- Build/commit: <branch> @ <sha> (read-only `git rev-parse --short HEAD`)
- Expected: <what the plan/AC requires, with the section reference>
- Actual: <what happened — status code, body, header, DB row, screenshot>
- Steps to reproduce:
  1. <command or click path>
  2. <command or click path>
- Evidence: <log excerpt (redacted) / screenshot path / CI run URL / HTTP transcript>
- Suspected owner: backend-dev | frontend-dev | lead (integration) | environment
- Status: NEW | TRIAGED | IN_FIX | FIXED | UNVERIFIED (deferred) | VERIFIED | CLOSED | WONTFIX | DUPLICATE
- Notes: <dependencies, workaround, related defects>
```

Rules for the report: paste the command and the observed result, never a paraphrase; redact passwords, JWTs, cookies, reset tokens, and API keys; include the exact endpoint/status/body for HTTP defects; include both the expected plan reference and the actual value so the Lead can adjudicate without re-reading the code.

The task report to `lead` follows [COLLABORATION §5](../team/COLLABORATION.md); defects are summarized there with `DEF-<n>`, severity, and status.

---

## 4. Lifecycle and triage

```
NEW ──► TRIAGED ──► IN_FIX ──► FIXED ──► VERIFIED ──► CLOSED
  │         │            │         │          │
  │         └─ DUPLICATE/WONTFIX    └─ UNVERIFIED (deferred) ──► re-verify in CI/staging
  └─ rejected as not-a-defect (Lead records why)
```

1. **Report.** The finder (QA, coder self-check, architect, Lead, human) reports with the block above. Findings from a review are sent to the Lead, not directly to another agent ([COLLABORATION §5](../team/COLLABORATION.md)).
2. **Triage.** The Lead classifies the defect (is it a defect at all? which AC/plan section?), ratifies severity, and assigns one owner. The Lead decides fix-vs-new-task: a trivial correction can be requested in place; anything more is a new task with its own write scope ([COLLABORATION §4.5](../team/COLLABORATION.md)).
3. **Fix.** The assigned coder fixes inside its own scope, adds the regression test (see §5), runs its self-checks, and reports with evidence. It does not mark the defect `CLOSED`.
4. **Reverify.** QA independently reproduces the original failing case in the same environment, then runs the affected layer's suite. QA records `VERIFIED` or reopens.
5. **Close.** Only the Lead closes the defect, after `VERIFIED` (or `WONTFIX` with a recorded rationale). The Lead commits the fix path.

Triage rules:

- A defect caused by a **task outside its scope** is reassigned by the Lead; the finder never fixes it.
- A defect in a **review task** (T4) does not get fixed by the reviewer; the Lead creates a fix task or reopens the implementation task.
- A **duplicate** is linked to the original; a **wontfix** requires a one-line, Lead-signed reason (e.g. accepted known gap D9).
- Severity may change during triage (up or down); the reason is recorded in the defect entry.

---

## 5. Regression rule

1. **Every P0/P1 fix ships with a regression test** — automated where the layer allows (unit for pure logic, e2e for transport/DB).
2. If an automated test is **impossible in the current environment** (e.g. DB-dependent), the fix task records the case in the [AC matrix](ac-matrix.md) or the deferred register with destination CI/staging and owner. The defect stays `UNVERIFIED (deferred)` — never `VERIFIED` — until that run exists.
3. **Reverification is from the failing case outward**, not the fixed line in isolation: rerun the original reproduction, then the affected suite (unit → e2e → smoke) and any adjacent case the fix could regress (e.g. a CSRF guard change reruns all non-GET paths).
4. A fixed defect's evidence includes: before (the original failure), after (same command now passing), and the test name/path that would catch a recurrence.
5. **No fix is closed on code inspection alone.** "The change looks right" is not verification.
6. If a defect recurs after a fix, reopen it and raise the severity one level (P2→P1, P1→P0) and report to the Lead immediately.
7. A fix for a `[OPEN-1]`-dependent behavior must not cite the literal AC as satisfied; the defect entry names the deviation explicitly.
8. No skipped/disabled tests added to make a fix green; that is itself a P1 defect ([COLLABORATION §6](../team/COLLABORATION.md)).

---

## 6. Ownership: who fixes what

| Role | Owns | Must not |
|---|---|---|
| `backend-dev` | Fixes backend defects in `backend/app` (`src/**`, `prisma/**`, scripts) | Edit QA docs, ADRs, frontend, or another agent's active files; run Git writes |
| `frontend-dev` | Fixes landing/UI defects in `frontend/app` | Edit backend, QA docs, ADRs |
| `architect` | Reports design/security findings; reviews the fix | Edit source code or QA docs; fix the defect |
| `qa-engineer` | Reproduces, isolates, reports, independently reverifies; maintains matrix/evidence | Edit source, ADRs, review docs; close defects; claim a deferred check passed |
| `lead` | Ratifies severity, assigns owner, creates fix tasks, adjudicates disputes with the plan, commits and closes | Implement feature code without a task; let a P0/P1 close without verification |

Human release owners remain the owners of US02 and the portal frontend (COLLABORATION §1); defects in those surfaces are routed to the Lead, not fixed by agents.

---

## 7. Escalation and communication

| Severity | When | Message |
|---|---|---|
| P0 | Immediately on discovery | One `send_message` to `lead`: title, severity, file/endpoint, evidence, proposed fix, whether it blocks the demo. Stop unrelated work on the affected surface; continue safe independent steps only if the Lead says so |
| P1 | Before the affected phase gate/commit | `lead` with evidence; do not wait for a daily checkpoint |
| P2 | Batched into the task report, or immediately if it affects an upcoming gate | `lead` report |
| P3 | Task report or retro | `lead` report |

Escalation is not a complaint; it is a status change the Lead needs to plan around. No progress spam, no cross-agent side channels ([COLLABORATION §5](../team/COLLABORATION.md)). If a defect is a blocker beyond the team's control (no DB, no staging, no GitHub credentials), state the blocker, the options, and a recommendation in the same message.

---

## 8. Environment honesty for defects

- A defect found in the sandbox via static reading is a **finding or a potential defect** until reproduced; report it as such.
- A fix for a DB-dependent defect cannot be `VERIFIED` locally. Record `FIXED` → `UNVERIFIED (deferred)`; the verification happens in the CI `api` job or staging, and the evidence is the run URL/log.
- Never write "fixed and verified" for a check the environment cannot run. This is the same rule as the evidence template's deferred block.
- A staging-only failure is reported with the staging URL and the deployed commit SHA; do not compare it against local code from memory.
- If a failure is caused by the environment (Railway cold start, Resend test-sender restriction), report it as an environment observation with evidence — not as a product defect, and not as a pass.

---

## 9. Definition of closed

A defect is `CLOSED` only when all are true:

- [ ] Severity ratified by the Lead; owner recorded.
- [ ] Root cause stated (not just the symptom).
- [ ] Fix is in the owner's scope and reported with evidence.
- [ ] Regression test exists, or the deferred verification is recorded with its destination — and the defect was `UNVERIFIED (deferred)` in the meantime.
- [ ] QA independently reproduced the failing case and confirmed it now passes (or the deferred run did).
- [ ] Affected AC matrix row updated with the new evidence/status.
- [ ] Lead committed the fix path and closed the defect.
