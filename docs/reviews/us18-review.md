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

## 2026-11-15 — STAB-US18 adversarial review (task-2, kanban k340)

| Field | Value |
|---|---|
| Tree reviewed | `stabilize/stab-us18` working tree vs `b064367` (uncommitted; Lead owns the commit) |
| Files | `frontend/app/lib/user-admin.{ts,test.mjs}`, `frontend/app/components/users/user-management-dashboard.tsx`, `docs/qa/{verification-us18,ac-matrix}.md`, `README.md` |
| Checks | read-only `git diff`/`status` + scoped source/doc read; Lead evidence logs/artifacts re-read; no suite re-run; no source edited |
| **Verdict** | **PASS WITH CHANGES** — 1 MINOR, 2 NIT; nothing blocking |

Findings (order = severity):

1. `frontend/app/components/users/user-management-dashboard.tsx:196-210,345,402,409` — **MINOR** — the AC's "toast/result is tied to the real send path" is proven only by the Lead's browser smoke: `frontend/app/lib/user-admin.test.mjs:191-246` exercises the copy helpers, so reverting the call sites (inline literals, or dropping the Resend retry) keeps `npm test` green. Fix: move the copy→toast adapter (`showToastCopy`, retry only when `actionLabel` + handler) into `lib/user-admin.ts` and add node:test cases that create keeps its Resend action and resend success has none.

2. `frontend/app/lib/user-admin.test.mjs:208,218,231` — **NIT** — the "no delivery claim" guards only ban the literal word `delivered`, and the resend-success test never asserts the positive "was sent to" wording, so an edit to "received"/"in your inbox" would stay green. Fix: assert `/was sent to/` in the resend-success test and widen the negative pattern to e.g. `/(delivered|received|inbox)/i` on both success copies.

3. `docs/qa/ac-matrix.md:39` — **NIT** — the AC3 evidence command omits the `cd backend/app &&` prefix used on the AC1 row (`:37`), so it is not copy-pasteable from the repo root. Fix: add the prefix.

No findings on: token/password/cookie exposure (toast copy carries name + email only, no link/token; no log or response change); guard/session/tokenVersion, CSRF and cookie items are N/A (no auth or route change); test honesty (copy asserted as data, not call-count mocks; positive assertions would fail on overclaim — the coverage gap is findings 1/2); `[OPEN-1]` stated as pending SM amendment with literal AC2 explicitly not claimed (`verification-us18.md:18,60`, `ac-matrix.md:14,38`); staging/Resend remain DEFERRED (`verification-us18.md:6,60`, `ac-matrix.md:33,37,107`, README); scope (`git status` shows only the six card paths, no schema/dependency/contract change).

Lead evidence claims checked and supported: 13/26 frontend test counts, cited e2e test titles, smoke 11/11 (`artifacts/stabilization/100-stab-us18-smoke.log`, production build, 0 console errors, real resend 200 + honest toast), Mailtrap probe `250 Ok: queued` with activation link and no dev password, app-flow 201/200 with hash-only INVITE and 0 failure markers; "no inbox claim" is accurate — no delivery claim is made anywhere.

Verdict: PASS WITH CHANGES
