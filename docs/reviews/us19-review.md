# US19 review — password reset, change-password, policy and frontend alignment

| Field | Value |
|---|---|
| Reviewer | `reviewer` (read-only on source) — 2026-11-14 |
| Backend | `feat/us19-backend` @ `988dc0c` vs `main` @ `f6dc087` — 40 files, +13619/−102 |
| Frontend | `fix/us19-frontend-contract` @ `569924f` vs `main` — 2 files, +77/−26 |
| `[OPEN-1]` | AC3 reviewed only as the agreed deviation — 12–128 code points after NFKC, no character classes, exact bundled blocklist — *met per agreed deviation, pending SM amendment*. No literal-AC3 claim found in code, tests, contract or evidence. |

**Verdict: PASS** — no blocking findings. Two non-blocking P3 notes below; nothing needs to change before the Lead pushes.

All eight §6 rubric dimensions were checked; none failed outside the P3 notes. Scope call: every changed path
maps to US19 tasks; the `.env.example`/CI lines are Lead commit `23546b7`, not implementer drift; no schema,
migration or other story's code changed. The frontend branch was reviewed statically only (switching branches
is forbidden for this review), so its lint/build result remains the T8 report plus CI.

## Findings

- **P3** `backend/app/src/auth/password-recovery.service.ts:266` — the admin alert interpolates an arbitrary
  `errorMessage` (`errorMessageOf`, line 44). Today `EmailSendError` messages are generic, so no leak exists;
  but the AC "the alert never contains the token or reset URL" then depends on adapter discipline, not
  redaction — a transport error echoing the rendered body would put the link into a retained admin email.
  **Fix:** send only `errorName`/`stage` (or redact `resetUrl`/token-shaped text) and add a template test
  whose input error message contains the reset URL.
- **P3** `docs/api-contract-us18-us19.md:280` — suite counts are stale at the reviewed head:
  `auth-reset.e2e-spec.ts` is 25 tests (doc says 22), `test:db` 43 per `verification-us19.md` (doc says 42),
  `test:e2e` 55 (doc says 52); `npm test` 150 is current. **Fix:** refresh the four numbers or drop the
  per-command counts and leave `docs/qa/verification-us19.md` as the single tally.

## Reviewer checks (targeted only; full suites are CI's and the Lead's)

- Tree: `git branch --show-current` → `feat/us19-backend`, clean before and after; no branch switch, no git writes.
- `npx vitest run src/auth/password-policy.spec.ts src/auth/password-hasher.spec.ts src/auth/reset-token.service.spec.ts src/email/templates/admin-alert.template.spec.ts` → 4 files, **50/50** (policy matrix incl. 11/12/128/129, NFKC counting, fullwidth/uppercase blocklist, token hash/TTL, alert copy).
- `npx vitest run --config ./vitest.config.db.ts test/db/password-recovery.repository.db-spec.ts test/db/reset-tokens.repository.db-spec.ts` → **21/21** on `raf_pms_test` (reset/change transactions, sibling-token kill, no auto-login, concurrency one-winner).
- `npx vitest run --config ./vitest.config.e2e.ts test/auth-reset.e2e-spec.ts -t …` on `raf_pms_e2e` → **6/6** selected: expired/used/unknown/inactive share the exact generic 400, change rotates cookie and old/second-device cookies 401 while the new one gets `/auth/me` 200, token/password/hash absent from bodies and captured logs, concurrent same-token exactly one winner, token-issue/send-failure alerts.
- Provenance: blocklist 73 026 bytes / 10 001 lines, sha256 `68782d6a…fdcce` and `LICENSE-SecLists.txt` `3dbdc93d…ded66c` match `docs/third-party-notices.md`; `dist/auth/data/` holds both assets after build, so the `nest-cli.json` asset rule works.
- Frontend (static): base `http://localhost:4000`, `X-MARS-CSRF: 1` + `credentials: "include"` on both POSTs, body `{token,newPassword}`, 204-before-JSON forgot, exact-message expired branch, client 12-code-point NFKC minimum, `/login` CTA, `Referrer-Policy: no-referrer`, no console logging, no new deps — matches contract §6 and k213.
