# Evidence Template — MARS Sprint 1

| Field | Value |
|---|---|
| Owner | `qa-engineer` |
| Use for | Every task report, QA verification doc, and staging/DoD evidence entry |
| Rules | [`strategy.md`](strategy.md) §9; [`../team/COLLABORATION.md`](../team/COLLABORATION.md) §5–§6 |
| Last updated | 9 Nov 2026 (T3) |

Copy the block that fits. Paste **commands and results**, not adjectives. If a check did not run, it is `DEFERRED (<reason>)` — never `PASS`. Redact passwords, JWTs, cookies, reset tokens, and API keys before saving or pasting.

---

## 1. Full evidence block (use in `docs/qa/verification-*.md` and DoD evidence)

```markdown
# Evidence — <task id> <title>

| Field | Value |
|---|---|
| Task | <task id> |
| Owner | <agent/member> |
| Verified by | <agent/member> (independent? yes/no) |
| Date | <yyyy-mm-dd hh:mm TZ> |
| Environment | agent sandbox (no DB / no Docker) \| CI run <url> \| staging <url> \| manual browser |
| Revision | branch `<branch>` @ `<short sha>` (`git rev-parse --short HEAD`; read-only) |
| Node / tools | `node --version` → <vX>; `npm --version` → <vY>; DB: none \| CI service \| staging |
| Verdict | PASS \| PARTIAL \| FAIL |

## Commands run

| # | Command (working dir) | Result | Evidence / notes |
|---|---|---|---|
| 1 | `<command>` (`<dir>`) | exit <code> — <one-line result> | <log path / run URL / key output line> |
| 2 | `<command>` (`<dir>`) | exit <code> — <one-line result> | <…> |

## Acceptance criteria

| AC / check | Status | Evidence |
|---|---|---|
| <AC text or task acceptance item> | PASS \| PARTIAL \| FAIL \| DEFERRED (no DB) \| DEFERRED (no staging) | <test name / command output / artifact path> |

## Deferred checks

| Check | Why deferred | Destination | Owner |
|---|---|---|---|
| `npm run test:e2e` (list specs) | No Docker/Postgres in sandbox | CI `api` job | <owner> |
| Migration apply / seed / DB state | No DB | CI, staging pre-deploy | <owner> |
| `scripts/smoke-staging.sh` run | Staging not deployed | Railway staging (Day 6+) | <owner> |
| Email delivery (Mailtrap/Resend) | No transport/staging | Mailtrap dev, Resend staging | <owner> |
| Landing a11y / responsive / Lighthouse | Landing not built | Local build + Vercel staging | <owner> |

**Deferred is not passed.** No deferred row above is claimed as verified.

## Artifacts

| Path | What it shows |
|---|---|
| `docs/qa/evidence/<yyyy-mm-dd>-<task>/<file>.png` | <e.g. DevTools showing HttpOnly mars_at, no token in body> |
| `docs/qa/evidence/<yyyy-mm-dd>-<task>/<file>.log` | <e.g. full command output> |
| <CI run URL / staging URL> | <e.g. `api` job: lint, build, unit, e2e green> |

## Defects found

| ID | Severity | Summary | Status |
|---|---|---|---|
| DEF-<n> | P0–P3 | <one line> | NEW / TRIAGED / FIXED / VERIFIED (deferred) / CLOSED |

## Environment limitations observed

- <none | concrete limitation and its effect on which checks could not run>

## Reproducibility

- Prerequisites: <deps installed? DB? env vars? seed?>
- Data state: <fresh test DB truncated by resetDatabase() / demo seed / no DB>
- Known non-determinism: <e.g. argon2 timing, cold start, email delivery latency>

## Honesty checklist

- [ ] Every command above was actually run in the stated environment.
- [ ] No deferred check is reported as passed.
- [ ] No password, JWT, cookie value, reset token, or API key appears anywhere in this evidence.
- [ ] Failed checks are reported as failures with the exact error, not omitted.
- [ ] AC statuses match the [AC matrix](ac-matrix.md) and cite its evidence.
```

---

## 2. Compact task report (use in `send_message` to `lead`)

```text
TASK <id> — <status: done | partial | blocked>
Changed: <paths, comma-separated>
Checks: <command> → <result>; <command> → <result>; <command> → DEFERRED (no DB)
Decisions: <choices made inside the task and why>
Risks/blockers: <none | concrete blocker + options + recommendation>
Next: <what the Lead should review / what is needed from whom>
```

Attach the full block as a file path when the evidence is longer than the report. One message per milestone; no progress spam. Keep under 200 words unless a failure needs a log tail.

---

## 3. Staging evidence block (Phase 5+)

```markdown
## Staging validation — <date> — commit `<short sha>`

- API: <Railway URL> — `/health` → <status/body>
- Frontend: <Vercel URL> — landing → `/login` route check
- Smoke: `BASE_URL=<url> SMOKE_EMAIL=<seeded account> SMOKE_PASSWORD=<from vault/env> bash scripts/smoke-staging.sh`
  → <PASS/FAIL summary; attach `docs/qa/evidence/<date>-staging/smoke.log`>
- Auth in browser: DevTools shows `mars_at` HttpOnly/Secure/SameSite=None; no token in response body or `localStorage` (screenshot path)
- US18: create user via US02 → welcome email in <Resend/Mailtrap> → link present, no credentials (screenshot path)
- US19: forgot → emailed reset link → set new password → login works; expired/reused link → generic error (screenshot paths)
- CORS: request from exact Vercel origin → `Access-Control-Allow-Origin` + `Allow-Credentials: true`; preview URL rejected (transcript path)
- DoD mapping: <items 1–6 with met / met per OPEN-1 deviation / not met>
- Known gaps stated: rate limiting (§7.9), Resend test-sender limitation if used, preview CORS not allowlisted
```

Staging evidence names the **deployed commit SHA** and the **exact URLs**. A screenshot without the URL/commit is not staging evidence.

---

## 4. Rules that prevent a bad evidence block

| Do not write | Write instead |
|---|---|
| "tests pass" | `npm test` → exit 0, `11/11 passed` (with date/environment) |
| "migration applied" in the sandbox | `npx prisma migrate diff …` → SQL generated; **apply**: `DEFERRED (no DB)` |
| "e2e green" without a DB | `DEFERRED (no DB)`; CI run URL when it exists |
| "staging verified" before staging exists | `DEFERRED (no staging)` |
| A status of `PASS` with no artifact | The command, its output, and the artifact path |
| A pasted password/token "for reproducibility" | The env var **name** and where the operator gets it |
| A failed check omitted from the table | The exact command, exit code, and error; verdict `PARTIAL`/`FAIL` |
| "should work" / "looks correct" | The check that proves it, or the deferral that replaces it |

---

## 5. Minimum evidence per task type

| Task type | Minimum evidence |
|---|---|
| Docs / QA harness (T3, T2) | Commands run (`bash -n`, link check, `git status` read-only), file list with paths, syntax-check result, deferred list |
| Backend feature (T1, Phase 2–4) | `prisma validate`/`generate`, `lint`, `build`, `unit`, e2e in CI; static schema/migration review; DB checks `DEFERRED (no DB)` locally |
| Independent verification (T5) | Every acceptance command reproduced from scratch, per-item PASS/FAIL, defects, clear `PASS`/`PARTIAL`/`FAIL` |
| Staging / DoD | Smoke log, URLs + commit SHA, screenshots per AC, deferred/known gaps |
| Landing | Build log, responsive screenshots at five widths, axe/Lighthouse artifacts, manual keyboard/focus notes |
