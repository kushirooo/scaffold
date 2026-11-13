# US18 review — welcome email on account creation

| Field | Value |
|---|---|
| Branch / HEAD | `feat/us18-welcome-email` @ `6fb12fc`, diffed against `feat/prisma-foundation` (`b730a96`) |
| Diff | 43 files, +3271/−4: T0 config/deps/CI, T1 transport, T2 templates, T3 invite tokens, T4 seam doc, T5a service/seam, T5b e2e/evidence |
| Reviewer | `reviewer` (read-only) — 2026-11-13 |

**Verdict: PASS**

## Rubric, in order
1. **Credentials** — No raw token, password, hash or cookie appears in logs, admin alerts, docs, fixtures, error messages or responses. The raw token exists only in the activation URL inside the recipient's email; storage gets unsalted SHA-256 hex of a 256-bit random token; e2e asserts the failure log and alert JSON contain neither the raw token nor the link.
2. **Guard/session/role/tokenVersion** — N/A: no guard, session or auth flow changed; T3 only registers an issue-only token service. No regression.
3. **CSRF before auth** — N/A: no non-GET route added or modified.
4. **Cookie flags** — N/A: no cookie code touched.
5. **Real behaviour** — `MemoryEmailSender` is exercised as the real class (copy-on-read outbox); e2e runs against real PostgreSQL and proves stored `token_hash === sha256(rawToken)` with `usedAt` null and one live INVITE row; failure paths drive a real `EmailSender` contract, not call-count mocks.
6. **Inversion** — Every key assertion fails if the logic flips: result `{status:'sent'}`/message count (success), `tokenHash === expected` plus `not.toContain(rawToken)` (hashing), 1/2 attempt counts (one alert, no recursion), `resolves`/no rejection (never throws), `&lt;script&gt;` (escaping), no CR/LF in subject (`headerSafe`), production throws (fail-fast), config asserts `memory` (e2e force). No trivially-passing test found.
7. **Scope creep** — None: no US19 consume/reset endpoint, policy or blocklist, no US02 code, no frontend, schema or migration change. T2's reset template is the planned shared template asset, not a US19 endpoint. Only in-scope paths.
8. **Error messages** — Auth/reset messages unchanged; the handler returns `{status:'failed'}` without surfacing provider text; the admin alert carries only error class/message. PASS.
9. **US18 emphasis** — `fullName`, `email`, error and URLs are escaped by `escapeHtml` in HTML; the admin subject strips CR/LF (`headerSafe`); handler never throws, sends exactly one alert, and an alert failure logs once and stops; e2e `EMAIL_SENDER` override plus forced `EMAIL_TRANSPORT=memory` are genuine (setup runs before `AppModule`; asserted in-test).

## Findings
None blocking.

Non-blocking (informational, no branch change required):
- `docs/qa/verification-us18.md:23–29` — evidence records targeted `src/accounts` and e2e but not `npm test` / `npm run test:db`, so the new DB spec and T1/T2 unit specs are evidenced only by CI's `api` job. Suggest appending the two command rows (55→57 lines, still ≤60) if a consolidated record is wanted.
- `src/accounts/welcome-email.service.ts:105` — the failure log includes the recipient's email (PII, not a secret; intentional and e2e-asserted). Acceptable under the team's structured-log convention; no change requested.

## Reviewer checks (read-only)
- `git branch --show-current` → `feat/us18-welcome-email` before and after; tree clean.
- `npx vitest run src/accounts src/email src/config --reporter=dot` → 12 files, 76/76 pass (targeted only; full suite/DB/e2e not re-run — T5b evidence and CI cover them).
- Lead integration edits accounted for, not defects: repository comment now states invalidation order (not concurrency safety); e2e harness forces `EMAIL_TRANSPORT=memory`.
