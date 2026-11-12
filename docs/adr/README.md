# Architecture Decision Records — MARS, RAF CONSULT

| Field | Value |
|---|---|
| Owner | `architect` (`docs/team/COLLABORATION.md` §2) |
| Scope | Sprint 1 (9–18 Nov 2026) — US01, US18, US19, landing shell |
| Source of truth | `/home/anoshizuku/Projects/SPRINT1_PLAN.md` (outside the repo) |
| Status | Active — first issue, 9 November 2026 |

This directory records the decisions the implementation and the reviews depend on. It does
**not** create new product decisions: it captures what the sprint plan already decided
(`SPRINT1_PLAN.md` §5, D1–D12) and separates it from what is still **pending ratification**
by the Scrum Master (`SPRINT1_PLAN.md` §4, `OPEN-1`–`OPEN-3`).

## How to read this directory

| Status | Meaning |
|---|---|
| **Accepted** | Decided in the plan, the brief or the environment contract. Code and reviews may rely on it |
| **Pending ratification** | An `OPEN-*` item. Not settled; no document, code comment, demo or slide may present it as decided |
| **Superseded** | Replaced by a later ADR or contract version; kept for history |

Precedence when documents disagree: `SPRINT1_PLAN.md` and the locked brief **beat** the
v1 Bearer contract, implementation convenience and reviewer preference
(`COLLABORATION.md` §9). If the plan itself contradicts the collaboration contract, the
contradiction is escalated to the Lead; it is not resolved silently in an ADR.

## Index

| ADR | Title | Status | Decisions | Plan refs |
|---|---|---|---|---|
| [0001](0001-auth-transport-cookies.md) | Auth transport: httpOnly cookies, versioned sessions, CSRF header | Accepted | D2, D5 (+D1, D9) | §1.2, §5, §7 |
| [0002](0002-schema-ownership-prisma.md) | Database schema ownership and Prisma baseline | Accepted | D3, D4 | §1.2, §18 |
| [0003](0003-password-policy.md) | Password policy and hashing | Accepted (AC3 wording pending OPEN-1) | D11 | §9.2–§9.5 |
| [0004](0004-email-transport.md) | Email transport and failure semantics | Accepted (AC2 wording pending OPEN-1) | D6, D7, D8 | §8, §10 |

Related documents: [US01 API contract v1 (Bearer — superseded on Day 2)](../api-contract-us01.md)
· [third-party notices](../third-party-notices.md) · [team collaboration protocol](../team/COLLABORATION.md)
· sprint plan `../../../SPRINT1_PLAN.md` (outside the repository).

## Decision log — D1–D12 (decided)

These are implementation choices inside the locked scope, recorded in `SPRINT1_PLAN.md` §5
so they are visible and vetoable rather than discovered in review. They are not scope
changes and not `OPEN-*` items.

| ID | Decision | Where it appears |
|---|---|---|
| D1 | `redirectTo` is `/dashboard` for all four roles in Sprint 1; `role` is returned separately. Member 3 confirms on Day 2 | ADR 0001 consequences; contract v2 |
| D2 | Keep `sessions` for per-device logout; `tokenVersion` for global invalidation; both checked in the guard | [ADR 0001](0001-auth-transport-cookies.md) |
| D3 | Squash the pre-sprint schema into one Prisma baseline migration (no shared DB exists yet) | [ADR 0002](0002-schema-ownership-prisma.md) |
| D4 | `credentials.password_hash` becomes nullable; US02 creates the account before a password exists | [ADR 0002](0002-schema-ownership-prisma.md) |
| D5 | Require `X-MARS-CSRF: 1` on every non-GET request; no CSRF cookie | [ADR 0001](0001-auth-transport-cookies.md) |
| D6 | INVITE tokens live 24 h; RESET tokens live 15 min; same table with `purpose` | [ADR 0004](0004-email-transport.md) |
| D7 | Mailtrap for dev email; no Mailhog container | [ADR 0004](0004-email-transport.md) |
| D8 | Resend via HTTPS `fetch`, no SDK, 10 s `AbortSignal` timeout | [ADR 0004](0004-email-transport.md) |
| D9 | No rate limiting in Sprint 1; recorded as a known gap, not an omission | [ADR 0001](0001-auth-transport-cookies.md) §Decision 6 |
| D10 | No auto-login after reset; change-password keeps the current device signed in with a rotated cookie | [ADR 0001](0001-auth-transport-cookies.md) §Decision 3 |
| D11 | Password = 12–128 code points, NFKC-normalised, no character classes, exact-match blocklist | [ADR 0003](0003-password-policy.md) |
| D12 | `/login` and `/dashboard` are Member 3's routes; the landing CTA links to `/login` | Contract §12; landing scope |

## Ratification register — OPEN (not settled)

> **Rule (`SPRINT1_PLAN.md` §4):** no code, document or slide in this sprint may present
> `OPEN-1`/`OPEN-2`/`OPEN-3` as decided. Where the plan says "amended", it means "as the
> brief instructs, pending Scrum Master ratification".

| ID | Item | Owner | Deadline | Status | Impact on this sprint | Fallback if the deadline passes |
|---|---|---|---|---|---|---|
| **OPEN-1** | US18 AC2 ("initial login credentials and the login link") and US19 AC3 ("system complexity rules") must be amended: link instead of credentials; length policy instead of complexity | Scrum Master | Raised 9 Nov; amendment due 13 Nov | **OPEN — pending ratification** | US18 AC2 and US19 AC3 cannot be claimed as written; evidence and demo must carry the deviation label | Implementation proceeds as designed (link-only, length policy). Evidence says "met per agreed deviation, pending SM amendment"; escalate at the Day 8 DoD audit |
| **OPEN-2** | Backlog §4.1/§7.1 assignment tables are stale: they still give US02's backend to Member 2 and place US01 elsewhere | Scrum Master | 11 Nov | **OPEN — pending ratification** | Authorship/ownership record stays stale; the assessment record may not match the work | Plan proceeds on the brief's actual ownership; `CODEOWNERS` and PR history are the evidence; escalate before the Day 10 review |
| **OPEN-3** | Sprint total is 16 points vs 17; per-story points are not published | Scrum Master | 9 Nov | **OPEN — pending ratification** | Point split and burndown cannot be reported | Commit to deliverables and days, not point shares. Report story status, tests and staging evidence; invent no point split |

### What each open item touches in these docs

- **OPEN-1.** ADR 0003 (policy vs literal "complexity rules") and ADR 0004 (welcome email
  link vs literal "initial credentials"). Any evidence doc, PR description, demo script or
  acceptance table that touches US18 AC2 or US19 AC3 must carry the pending label.
- **OPEN-2.** Authorship and ownership records only — it does not change code, schema or
  the ADRs. `CODEOWNERS` and the PR history remain the truthful record.
- **OPEN-3.** Reporting only — no ADR decision depends on point allocation. The "points"
  columns in plan §2.1 remain "not published".

If a deadline passes: the plan's fallback applies — implementation continues as designed,
the deviation stays labelled, and the item escalates rather than being quietly resolved.

## Recording a new decision

1. If it changes a D1–D12 choice, it is a new ADR that supersedes the old one; do not
   rewrite an accepted ADR to hide the change.
2. If it is an `OPEN-*` outcome, update the register here **and** the evidence doc, quoting
   the ratification source (Scrum Master decision, backlog amendment).
3. If it is genuinely undecided, record it as a question for the Lead — never as a silent
   assumption in code, docs or tests.

## Change history

| Date | Author | Change |
|---|---|---|
| 9 Nov 2026 | `architect` | Initial issue: ADR 0001–0004, decision log, ratification register, third-party notice stub |
