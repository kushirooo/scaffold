# US19 verification — password reset, change and policy

| Field | Value |
|---|---|
| Task | task-7 (k71) — US19 edge-case matrix + QA evidence |
| Owner / verified by | implementer self-check + independent review (task-9) + Lead manual API/header run |
| Date / environment | 2026-11-14 10:24 Asia/Kuala_Lumpur; agent sandbox, Node v26.13.0, local PostgreSQL 18 (`raf_pms_test`, `raf_pms_e2e`) |
| Revision | `feat/us19-backend` @ `49bf00c` + `fix/us19-frontend-contract` @ `569924f` (T10 P3 fix + CI TTL coercion) |
| Verdict | **PASS (local)** for the US19 API; CI suites **PASS (CI)**; US18 AC1 and staging `DEFERRED` |

`[OPEN-1]`: US19 AC3 asks for "system complexity rules"; the implemented policy is the
agreed deviation — **12–128 code points after NFKC, no character classes, exact bundled
blocklist** — *met per agreed deviation, pending SM amendment*. Literal AC3 is not claimed.

## Commands run (from `backend/app`)

| # | Command | Result |
|---|---|---|
| 1 | `npm test` | exit 0 — 22 files, **151/151** |
| 2 | `npm run test:db` | exit 0 — 6 files, **43/43** on `raf_pms_test` |
| 3 | `npm run test:e2e` | exit 0 — 5 files, **56/56** on `raf_pms_e2e` |
| 4 | `npm run lint` | exit 0 — 0 warnings, 0 errors |
| 5 | `npm run build` | exit 0 — `nest build` |
| 6 | GitHub Actions `api` + `web` on PR #4 | **pass** — run `43547780234` |

## Acceptance criteria (plan §16.3 US19) → evidence

| Check | Status | Evidence |
|---|---|---|
| forgot known → 204 + one email; unknown/inactive/invited → 204, no email; duplicate re-issue kills older link | PASS (local) | e2e forgot cases |
| reset `RESET`/`INVITE` valid → 200, argon2 credential, token used, tokenVersion+1, sessions revoked, siblings used | PASS (local) | e2e reset cases; DB `resetPassword` |
| reset expired/used/unknown/inactive → identical generic 400; password/token unchanged | PASS (local) | e2e invalid-link case; DB cases |
| reset: empty 200, no `Set-Cookie` (no auto-login) | PASS (local) | e2e reset success assertions |
| policy 11 reject, 12/128 accept, 129 reject; spaces/emoji/all-lowercase accept; blocklist (incl. uppercase/fullwidth) reject | PASS (local) | e2e reject + accept matrix; `password-policy.spec.ts` 16/16 |
| NFKC: NFC-set password, NFD login | PASS (local) | e2e NFKC case |
| concurrent same-token reuse → exactly one success | PASS (local) | e2e + DB concurrency cases |
| change: wrong-current generic 401; policy 400; success rotates cookie; old/second-device 401; one live session | PASS (local) | e2e + DB change cases |
| token/password/hash absent from bodies and captured logs; hash-only at rest | PASS (local) | e2e secrets case; forced-failure log cases; DB hash assertions |
| fail paths: token/email/alert throw → still 204, one alert, no token/reset URL in alert/log (redaction regression) | PASS (local) | e2e failure cases + T10 redaction test |
| frontend pages aligned: CSRF header, `{token,newPassword}`, exact generic-400 branch, 12–128 client check; `Referrer-Policy: no-referrer` | PASS (local) — browser click-through/Mailtrap delivery DEFERRED | frontend `569924f`; Lead manual header + API reset→login→change flow; k213 |
| US18 AC1 — account creation triggers welcome email | DEFERRED (no US02) | US18 e2e covers the `account.created` event; US02 emitter absent |
| CI suites / staging end-to-end (DoD item 5) | PASS (CI) for suites; staging DEFERRED (no staging) | run `43547780234` api+web pass; staging not deployed |

## Deferred checks

- Staging forgot→email→reset→login and Mailtrap/Resend delivery — staging not deployed (Lead/QA).
- US18 AC1 (`account.created` emission) — US02 is not in this slice (Lead).
Deferred is not passed; no CI or staging result is claimed.

## Defects found

None blocking. Independent review PASS with 2 P3s, both resolved — alert error-message redaction (`8ca728d`) and stale contract counts (Lead docs). Known limitations (not defects): no forgot-password rate limit, forgot timing not equalised, exact-match blocklist, no token-row cleanup. CI-only TTL string-coercion regression fixed (`49bf00c`). Add throttling before production.

## Honesty checklist

- [x] Every command above was run in the stated local environment.
- [x] No deferred check is reported as passed; CI/staging are not claimed.
- [x] No password, JWT, cookie value, raw reset token or hash appears in this evidence.
- [x] No failed check omitted (none failed).
- [x] Statuses use strategy §8 vocabulary; `docs/qa/ac-matrix.md` is updated by the Lead; `[OPEN-1]` is stated as a deviation, not literal AC3.

## STAB-US19 residual hardening (15 Nov 2026)

Branch `stabilize/stab-us19` (from `main` @ `3cde2d2`). Residual security gaps closed without a
new dependency or schema/migration change.

| Change | Evidence |
|---|---|
| Per-address forgot-password throttle: **5 requests / 15 min** (in-memory sliding window on the trimmed, lower-cased email). Over-limit: `204`, no email, no lookup, structured `forgot_password_rate_limited` log with no email/token. Bounded to 10 000 tracked addresses | `src/auth/forgot-password-rate-limiter.spec.ts` (window expiry, per-address isolation, over-limit without extending the window, synchronous burst cap, sweep reclamation, map bound); e2e `test/auth-reset.e2e-spec.ts` → `rate-limits repeated forgot requests per address…` |
| Response-time floor: **500 ms** minimum applied in `finally` to known, unknown and failure branches (fake-timer unit test at the service boundary). Provider SMTP latency can exceed the floor on a real send — stated, not hidden | `src/auth/forgot-password-rate-limiter.spec.ts` (floor + service-branch cases) |
| Reset-token cleanup: `pruneExpiredAndUsed()` deletes expired **and** used `password_reset_tokens` rows for **both purposes**, called after every successful issuance and failing open (logged `reset_token_prune_failed`, issuance still succeeds); the just-issued row is never matched | `src/auth/reset-token.service.spec.ts`; `test/db/password-recovery.repository.db-spec.ts` (`pruneExpiredAndUsed`); e2e re-issue prune case |
| Decisions: exact-match blocklist stays (substring matching would reject valid passphrases); limit 5 exceeds the other tests' max 2 forgot calls per address (the new rate-limit test makes 7); staging/Mailtrap evidence remains **DEFERRED** (no staging; k344 owns it); `[OPEN-1]` remains the agreed deviation pending SM amendment — literal US19 AC3 not claimed | this doc; ADR 0003 |
| US02 resend e2e updated (Lead-approved cross-story edit): after a welcome resend the invalidated (used) INVITE row is pruned and exactly one live unused row remains; replaying the old raw link still returns the generic `400` | `test/user-management.e2e-spec.ts` → `resends the welcome email and replaces the previous unused INVITE token` |

Commands (15 Nov 2026, from `backend/app`, all exit 0): `npm test` **165/165** (23 files) ·
`npm run test:db` **45/45** (6 files, `raf_pms_test`) · `npm run test:e2e` **74/74** (8 files,
`raf_pms_e2e`) · `npm run lint` 0 warnings/0 errors · `npm run build`.

Status: **PASS (local)** for the hardening above; CI and staging are not claimed.
